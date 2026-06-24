# Fix Stale Profile Links (Issue #12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user changes their username, other users' ConversationList links update in real-time without a page reload.

**Architecture:** `ConversationList` currently receives `profiles` as a static prop (fetched once by the Server Component layout) and uses it as a plain closure variable. The fix adds a `profilesRef` (always reflecting the latest profile data) and a `postgres_changes` UPDATE subscription on the `profiles` table. When a username change arrives, the ref is updated and `conversations` state is patched so the rendered links immediately point to the new username. `handleInsert` is changed to use `profilesRef.current` instead of the `profiles` prop, which also removes `profiles` from its dependency array — preventing message channel teardown/resubscribe on profile changes.

**Tech Stack:** React (useRef, useCallback, useEffect), Supabase Realtime (`postgres_changes` UPDATE), TypeScript, Vitest + React Testing Library

## Global Constraints

- Branch: `fix/stale-profile-links` (already created)
- Working directory: `C:\ClaudeProjects\chat-app`
- Run tests with: `npm run test:run`
- All tests must pass before committing
- No ESLint errors (`npm run lint`)
- Follow existing Realtime cleanup pattern: `channel.teardown()` + `(supabase.realtime as unknown as { _remove: ... })._remove(channel)` — do NOT use `supabase.removeChannel()` (see ADR-005)
- Supabase client: always `createClient()` from `@/lib/supabase/client` (browser singleton)
- `postgres_changes` subscriptions require a topic that includes the event type in the channel name to avoid topic collisions; use `profiles-${currentUserId}` as the channel name

---

### Task 1: Write failing tests for profile username update

**Files:**
- Create: `tests/components/ConversationList.test.tsx`

**Interfaces:**
- Consumes: `ConversationList` from `@/components/conversations/ConversationList` (Props: `currentUserId: string`, `profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>[]`)
- Produces: nothing (test-only)

- [ ] **Step 1: Create the test file with mocks**

```tsx
import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationList } from '@/components/conversations/ConversationList'

// Capture Realtime handlers by channel name so tests can fire simulated events
const channelHandlers = new Map<string, (payload: unknown) => void>()

const initialMessages = [
  {
    id: 'msg-1',
    sender_id: 'user-b',
    receiver_id: 'user-a',
    content: 'Hello',
    created_at: '2026-06-18T10:00:00.000Z',
    read_at: null,
  },
]

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: initialMessages }),
          })),
        })),
      })),
    })),
    channel: vi.fn((name: string) => {
      const ch = {
        on: vi.fn((_event: string, _filter: object, handler: (payload: unknown) => void) => {
          channelHandlers.set(name, handler)
          return ch
        }),
        subscribe: vi.fn().mockReturnValue(undefined),
        teardown: vi.fn(),
      }
      return ch
    }),
    realtime: { _remove: vi.fn() },
  })),
}))

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/'),
}))

vi.mock('@/hooks/usePresence', () => ({
  usePresence: vi.fn().mockReturnValue({ isOnline: vi.fn().mockReturnValue(false) }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: () => void }) =>
    React.createElement('a', { href, onClick }, children),
}))

const alice = { id: 'user-b', display_name: 'Alice', avatar_url: null, username: 'alice' }

beforeEach(() => {
  channelHandlers.clear()
  vi.clearAllMocks()
})

describe('ConversationList', () => {
  it('renders a conversation link using the profile username', async () => {
    render(<ConversationList currentUserId="user-a" profiles={[alice]} />)
    const link = await screen.findByRole('link')
    expect(link).toHaveAttribute('href', '/chat/alice')
  })

  it('updates the conversation link when a profile username changes via Realtime', async () => {
    render(<ConversationList currentUserId="user-a" profiles={[alice]} />)

    // Wait for initial load
    await screen.findByRole('link')

    // Simulate a Realtime UPDATE event arriving on the profiles channel
    const handler = channelHandlers.get('profiles-user-a')
    expect(handler).toBeDefined()

    act(() => {
      handler!({ new: { ...alice, username: 'alice-new' } })
    })

    await waitFor(() => {
      expect(screen.getByRole('link')).toHaveAttribute('href', '/chat/alice-new')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm run test:run -- tests/components/ConversationList.test.tsx
```

Expected output:
- First test (`renders a conversation link`) — **FAIL** (no ConversationList tests exist yet, or the component may pass; confirm the second test fails)
- Second test (`updates the conversation link`) — **FAIL** because:
  - No profiles channel subscription exists yet
  - `channelHandlers.get('profiles-user-a')` returns `undefined`
  - The link still shows `/chat/alice` after the simulated event

If the first test passes immediately (the component already renders links correctly), that is expected — the bug only affects the second case. Confirm the second test fails before proceeding.

- [ ] **Step 3: Commit the failing tests**

```
git add tests/components/ConversationList.test.tsx
git commit -m "test: add failing tests for real-time profile username updates"
```

---

### Task 2: Add profile UPDATE subscription and fix handleInsert to use ref

**Files:**
- Modify: `components/conversations/ConversationList.tsx`

**Interfaces:**
- Consumes: `RealtimePostgresUpdatePayload` from `@supabase/supabase-js` (new import)
- Produces: no API change (same component props)

The entire updated file (show the complete file — the implementer should replace it wholesale to avoid partial edits):

- [ ] **Step 1: Write the updated ConversationList.tsx**

Replace the entire file with:

```tsx
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import type { RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from '@supabase/supabase-js'
import type { Profile, Message } from '@/types'
import { ConversationItem } from './ConversationItem'
import { usePresence } from '@/hooks/usePresence'
import { createClient } from '@/lib/supabase/client'

type Props = {
  currentUserId: string
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>[]
}

type ConversationSummary = {
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>
  lastMessage: Message
}

function sortByRecency(list: ConversationSummary[]): ConversationSummary[] {
  return [...list].sort(
    (a, b) =>
      new Date(b.lastMessage.created_at).getTime() -
      new Date(a.lastMessage.created_at).getTime()
  )
}

export function ConversationList({ currentUserId, profiles }: Props) {
  const pathname = usePathname()
  const { isOnline } = usePresence()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [readTimestamps, setReadTimestamps] = useState<Map<string, string>>(new Map())
  // Holds the latest profile data for handleInsert lookups without adding profiles
  // to handleInsert's dependency array (which would teardown/resubscribe message channels).
  const profilesRef = useRef(profiles)
  const activeUsernameRef = useRef<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const match = pathname.match(/^\/chat\/([^/]+)$/)
    activeUsernameRef.current = match ? match[1] : null
  }, [pathname])

  useEffect(() => {
    async function load() {
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false })
        .limit(500)

      const lastByUser = new Map<string, Message>()
      for (const msg of messages ?? []) {
        const otherId =
          msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id
        if (!lastByUser.has(otherId)) lastByUser.set(otherId, msg)
      }

      const summaries: ConversationSummary[] = []
      for (const profile of profiles) {
        const lastMessage = lastByUser.get(profile.id)
        if (lastMessage) summaries.push({ profile, lastMessage })
      }

      setConversations(sortByRecency(summaries))
    }

    load()
  }, [currentUserId, profiles])

  const handleInsert = useCallback(
    (payload: RealtimePostgresInsertPayload<Message>) => {
      const msg = payload.new
      const otherId =
        msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id
      // Use ref so profile username changes don't require re-subscribing message channels
      const profile = profilesRef.current.find((p) => p.id === otherId)
      if (!profile) return

      setConversations((prev) => {
        const without = prev.filter((c) => c.profile.id !== otherId)
        return [{ profile, lastMessage: msg }, ...without]
      })

      if (activeUsernameRef.current === profile.username) {
        setReadTimestamps((prev) => new Map([...prev, [otherId, msg.created_at]]))
      }
    },
    [currentUserId]
  )

  useEffect(() => {
    const profilesChannel = supabase
      .channel(`profiles-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload: RealtimePostgresUpdatePayload<Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>>) => {
          const updated = payload.new
          profilesRef.current = profilesRef.current.map((p) =>
            p.id === updated.id ? { ...p, ...updated } : p
          )
          setConversations((prev) =>
            prev.map((c) =>
              c.profile.id === updated.id ? { ...c, profile: { ...c.profile, ...updated } } : c
            )
          )
        }
      )
      .subscribe()

    return () => {
      profilesChannel.teardown()
      ;(supabase.realtime as unknown as { _remove: (ch: typeof profilesChannel) => void })._remove(profilesChannel)
    }
  }, [currentUserId])

  useEffect(() => {
    const sentChannel = supabase
      .channel(`conv-sent-${currentUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `sender_id=eq.${currentUserId}`,
      }, handleInsert)
      .subscribe()

    const rcvdChannel = supabase
      .channel(`conv-rcvd-${currentUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${currentUserId}`,
      }, handleInsert)
      .subscribe()

    return () => {
      sentChannel.teardown()
      ;(supabase.realtime as unknown as { _remove: (ch: typeof sentChannel) => void })._remove(sentChannel)
      rcvdChannel.teardown()
      ;(supabase.realtime as unknown as { _remove: (ch: typeof rcvdChannel) => void })._remove(rcvdChannel)
    }
  }, [currentUserId, handleInsert])

  return (
    <aside className="w-[300px] flex-shrink-0 flex flex-col border-r border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Open</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map(({ profile, lastMessage }) => {
          const lastSeenAt = readTimestamps.get(profile.id)
          const isRead = lastSeenAt !== undefined && lastSeenAt >= lastMessage.created_at
          return (
            <ConversationItem
              key={profile.id}
              user={profile}
              lastMessage={lastMessage}
              isOnline={isOnline(profile.id)}
              isActive={pathname === `/chat/${profile.username}`}
              isRead={isRead}
              currentUserId={currentUserId}
              onOpen={() =>
                setReadTimestamps((prev) => new Map([...prev, [profile.id, lastMessage.created_at]]))
              }
            />
          )
        })}
      </div>
    </aside>
  )
}
```

Key changes from the original:
1. `profilesRef` (`useRef(profiles)`) replaces the `profiles` prop in `handleInsert`
2. `handleInsert` dependency array changes from `[currentUserId, profiles]` → `[currentUserId]`
3. New `profilesChannel` subscription: `postgres_changes` UPDATE on `profiles` — updates `profilesRef.current` (mutation) and calls `setConversations` to patch the embedded profile in each summary
4. New import: `RealtimePostgresUpdatePayload`

- [ ] **Step 2: Run the full test suite**

```
npm run test:run
```

Expected: all tests pass, including the two new ConversationList tests.

If `updates the conversation link` still fails, check:
- Is `channelHandlers.get('profiles-user-a')` returning a handler? The channel name must exactly match `profiles-${currentUserId}` where `currentUserId = 'user-a'`.
- Is the `.on()` mock capturing the handler? Check that the mock's `on` function sets `channelHandlers.set(name, handler)`.

- [ ] **Step 3: Run lint**

```
npm run lint
```

Expected: 0 errors. If `RealtimePostgresUpdatePayload` is not exported from `@supabase/supabase-js`, check the exact export name in `node_modules/@supabase/supabase-js/dist/module/index.d.ts` and update the import accordingly.

- [ ] **Step 4: Commit the fix**

```
git add components/conversations/ConversationList.tsx
git commit -m "fix: subscribe to profile updates so username changes reflect in ConversationList links in real-time"
```

---

## Self-Review

**Spec coverage:**
- ✅ Username change propagates to other users' ConversationList — covered by the `postgres_changes` UPDATE subscription + `setConversations` patch
- ✅ `handleInsert` uses updated profile username after change — covered by `profilesRef.current.find()`
- ✅ No message channel teardown/resubscribe on profile changes — covered by removing `profiles` from `handleInsert` deps

**Placeholder scan:** None found.

**Type consistency:**
- `RealtimePostgresUpdatePayload<Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>>` is used consistently
- `profilesRef.current` type matches `Props['profiles']` (same `Pick<Profile, ...>[]`)
