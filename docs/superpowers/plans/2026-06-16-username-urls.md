# Username URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace UUID segments in chat URLs with human-readable usernames so `/chat/alice` replaces `/chat/aaaaaaaa-aaaa-aaaa-aaaa-000000000001`.

**Architecture:** Add a unique `username` column to `profiles`, update the profile-creation trigger to read it from signup metadata, rename the `[userId]` route to `[username]` with a username→profile lookup, thread `username` through all components that generate chat links, and add a settings page for changing the username.

**Tech Stack:** Next.js 16 App Router (Server Components), Supabase (PostgreSQL + RLS), Vitest + React Testing Library, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-06-16-username-urls-design.md`

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/007_add_username_to_profiles.sql` |
| Modify | `supabase/migrations/004_profile_trigger.sql` *(trigger updated via new migration — do not edit the old file)* |
| Modify | `types/index.ts` |
| Modify | `lib/utils.ts` |
| Modify | `tests/lib/utils.test.ts` |
| Modify | `components/auth/RegisterForm.tsx` |
| Delete | `app/(chat)/chat/[userId]/page.tsx` (entire directory) |
| Create | `app/(chat)/chat/[username]/page.tsx` |
| Modify | `app/(chat)/layout.tsx` |
| Modify | `components/conversations/ConversationItem.tsx` |
| Modify | `tests/components/ConversationItem.test.tsx` |
| Modify | `components/conversations/ConversationList.tsx` |
| Modify | `components/nav/UserCard.tsx` |
| Modify | `components/nav/NavSidebar.tsx` |
| Create | `components/settings/UsernameForm.tsx` |
| Create | `app/(chat)/settings/page.tsx` |
| Create | `tests/components/UsernameForm.test.tsx` |

---

## Task 1: Feature Branch

- [ ] **Create branch**

```bash
git checkout -b feat/username-urls
```

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/007_add_username_to_profiles.sql`

- [ ] **Write the migration file**

Create `supabase/migrations/007_add_username_to_profiles.sql` with this exact content:

```sql
-- Add username column to profiles
ALTER TABLE public.profiles
  ADD COLUMN username text unique;

-- Format constraint: 3-30 chars, lowercase alphanumeric + hyphens + underscores
ALTER TABLE public.profiles
  ADD CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_-]{3,30}$');

-- Backfill existing users from their email local part
DO $$
DECLARE
  rec RECORD;
  base_name text;
  candidate text;
  suffix int;
BEGIN
  FOR rec IN
    SELECT p.id, u.email
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.username IS NULL
    ORDER BY p.id
  LOOP
    base_name := left(
      regexp_replace(lower(split_part(rec.email, '@', 1)), '[^a-z0-9_-]', '-', 'g'),
      30
    );
    candidate := base_name;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
      candidate := left(base_name, 27) || '-' || suffix::text;
      suffix := suffix + 1;
    END LOOP;
    UPDATE public.profiles SET username = candidate WHERE id = rec.id;
  END LOOP;
END $$;

-- Now enforce not-null (all rows are filled above)
ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL;

-- Update the profile-creation trigger to include username
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, username)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'username'
  );
  RETURN new;
END;
$$;
```

- [ ] **Apply the migration via Supabase MCP**

Use the `mcp__supabase__apply_migration` tool:
- `project_id`: `mpvgsacreyovrvjsbcjy`
- `name`: `add_username_to_profiles`
- `query`: *(contents of the file above)*

- [ ] **Verify the migration applied correctly**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT id, display_name, username
FROM public.profiles
ORDER BY display_name
LIMIT 5;
```

Expected: all rows have a non-null `username` value.

- [ ] **Commit**

```bash
git add supabase/migrations/007_add_username_to_profiles.sql
git commit -m "feat: add username column to profiles with backfill and trigger update"
```

---

## Task 3: Validation Utility + Type Update

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/utils.ts`
- Modify: `tests/lib/utils.test.ts`

- [ ] **Write the failing tests first**

Open `tests/lib/utils.test.ts` and replace its entire content with:

```ts
import { describe, it, expect } from 'vitest'
import { buildChannelName, formatTime, validateUsername } from '@/lib/utils'

describe('buildChannelName', () => {
  it('produces the same name regardless of uid order', () => {
    expect(buildChannelName('aaa', 'bbb')).toBe(buildChannelName('bbb', 'aaa'))
  })

  it('formats as dm:{min}:{max}', () => {
    expect(buildChannelName('bbb', 'aaa')).toBe('dm:aaa:bbb')
  })
})

describe('formatTime', () => {
  it('returns a string matching HH:MM format', () => {
    const result = formatTime('2026-06-04T14:30:00.000Z')
    expect(result).toMatch(/^\d{1,2}:\d{2}/)
  })
})

describe('validateUsername', () => {
  it('returns null for valid usernames', () => {
    expect(validateUsername('alice')).toBeNull()
    expect(validateUsername('alice-dev')).toBeNull()
    expect(validateUsername('alice_99')).toBeNull()
    expect(validateUsername('abc')).toBeNull()
    expect(validateUsername('a'.repeat(30))).toBeNull()
  })

  it('rejects usernames shorter than 3 characters', () => {
    expect(validateUsername('ab')).not.toBeNull()
    expect(validateUsername('a')).not.toBeNull()
  })

  it('rejects usernames longer than 30 characters', () => {
    expect(validateUsername('a'.repeat(31))).not.toBeNull()
  })

  it('rejects uppercase letters', () => {
    expect(validateUsername('Alice')).not.toBeNull()
    expect(validateUsername('ALICE')).not.toBeNull()
  })

  it('rejects spaces and unsupported special characters', () => {
    expect(validateUsername('alice smith')).not.toBeNull()
    expect(validateUsername('alice!')).not.toBeNull()
    expect(validateUsername('alice@example')).not.toBeNull()
  })

  it('rejects reserved words', () => {
    expect(validateUsername('login')).not.toBeNull()
    expect(validateUsername('register')).not.toBeNull()
    expect(validateUsername('chat')).not.toBeNull()
    expect(validateUsername('api')).not.toBeNull()
    expect(validateUsername('auth')).not.toBeNull()
  })
})
```

- [ ] **Run tests — confirm the new tests fail**

```bash
npm run test:run -- tests/lib/utils.test.ts
```

Expected: 3 existing tests pass, `validateUsername` tests fail with "validateUsername is not a function".

- [ ] **Add `username` to the Profile type**

Open `types/index.ts` and replace its content with:

```ts
export type Profile = {
  id: string
  display_name: string
  avatar_url: string | null
  updated_at: string | null
  username: string
}

export type Message = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  created_at: string
  read_at: string | null
}

export type Session = {
  userId: string
  email: string
  displayName: string
  avatarUrl: string | null
}
```

- [ ] **Add `validateUsername` and `RESERVED_USERNAMES` to `lib/utils.ts`**

Open `lib/utils.ts` and replace its content with:

```ts
export function buildChannelName(uidA: string, uidB: string): string {
  const [min, max] = [uidA, uidB].sort()
  return `dm:${min}:${max}`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export const RESERVED_USERNAMES = new Set(['login', 'register', 'chat', 'api', 'auth'])

export function validateUsername(username: string): string | null {
  if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
    return '3–30 characters · lowercase letters, numbers, - and _ only'
  }
  if (RESERVED_USERNAMES.has(username)) {
    return 'That username is reserved'
  }
  return null
}
```

- [ ] **Run tests — confirm all pass**

```bash
npm run test:run -- tests/lib/utils.test.ts
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add types/index.ts lib/utils.ts tests/lib/utils.test.ts
git commit -m "feat: add username to Profile type and validateUsername utility"
```

---

## Task 4: Registration Form

**Files:**
- Modify: `components/auth/RegisterForm.tsx`

- [ ] **Replace `components/auth/RegisterForm.tsx` with the updated form**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { validateUsername } from '@/lib/utils'

export function RegisterForm() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const usernameError = validateUsername(username)
    if (usernameError) {
      setError(usernameError)
      return
    }

    setIsLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName, username } },
    })

    if (error) {
      setError(error.message)
      setIsLoading(false)
      return
    }

    if (data.session) {
      router.push('/chat')
      router.refresh()
    } else {
      setConfirmationSent(true)
      setIsLoading(false)
    }
  }

  if (confirmationSent) {
    return (
      <div className="text-center space-y-4">
        <div className="text-4xl">📬</div>
        <h2 className="text-lg font-semibold text-gray-900">Check your email</h2>
        <p className="text-sm text-gray-500">
          We sent a confirmation link to <span className="font-medium text-gray-700">{email}</span>.
          Click it to activate your account, then sign in.
        </p>
        <Link href="/login" className="block w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-center">
          Go to sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="display-name" className="block text-sm font-medium text-gray-700 mb-1">
          Display name
        </label>
        <input
          id="display-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
          Username
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-400">3–30 characters · lowercase letters, numbers, - and _ only</p>
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
      >
        {isLoading ? 'Creating account...' : 'Create account'}
      </button>
      <p className="text-center text-sm text-gray-500">
        Have an account?{' '}
        <Link href="/login" className="text-blue-600 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
```

- [ ] **Run all tests to confirm nothing broke**

```bash
npm run test:run
```

Expected: 23 tests pass.

- [ ] **Commit**

```bash
git add components/auth/RegisterForm.tsx
git commit -m "feat: add username field to registration form with client-side validation"
```

---

## Task 5: Chat Route Rename

**Files:**
- Create: `app/(chat)/chat/[username]/page.tsx`
- Delete: `app/(chat)/chat/[userId]/page.tsx` (and the `[userId]` directory)
- Modify: `app/(chat)/layout.tsx`

- [ ] **Create the new `[username]` directory and page**

Create `app/(chat)/chat/[username]/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatPanel } from '@/components/chat/ChatPanel'

type Props = {
  params: Promise<{ username: string }>
}

export default async function ChatPage({ params }: Props) {
  const { username } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: otherUser } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, username')
    .eq('username', username)
    .single()

  if (!otherUser) notFound()
  if (otherUser.id === user.id) notFound()

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .or(
      `and(sender_id.eq.${user.id},receiver_id.eq.${otherUser.id}),and(sender_id.eq.${otherUser.id},receiver_id.eq.${user.id})`
    )
    .order('created_at', { ascending: true })
    .limit(50)

  return (
    <ChatPanel
      currentUserId={user.id}
      otherUser={otherUser}
      initialMessages={messages ?? []}
    />
  )
}
```

- [ ] **Delete the old `[userId]` directory**

```bash
rm -rf "app/(chat)/chat/[userId]"
```

- [ ] **Update the layout profiles query to include `username`**

Open `app/(chat)/layout.tsx`. Find the profiles query:

```ts
const { data: profiles } = await supabase
  .from('profiles')
  .select('id, display_name, avatar_url')
  .neq('id', user.id)
  .order('display_name')
```

Replace it with:

```ts
const { data: profiles } = await supabase
  .from('profiles')
  .select('id, display_name, avatar_url, username')
  .neq('id', user.id)
  .order('display_name')
```

- [ ] **Commit**

```bash
git add "app/(chat)/chat/[username]/page.tsx" "app/(chat)/layout.tsx"
git rm -r "app/(chat)/chat/[userId]"
git commit -m "feat: rename chat route from [userId] to [username] with profile lookup"
```

---

## Task 6: Thread `username` Through Components and Links

**Files:**
- Modify: `components/conversations/ConversationItem.tsx`
- Modify: `tests/components/ConversationItem.test.tsx`
- Modify: `components/conversations/ConversationList.tsx`
- Modify: `components/nav/UserCard.tsx`
- Modify: `components/nav/NavSidebar.tsx`

- [ ] **Update `ConversationItem.tsx`**

Replace `components/conversations/ConversationItem.tsx` with:

```tsx
import Link from 'next/link'
import type { Profile, Message } from '@/types'
import { formatTime } from '@/lib/utils'

type Props = {
  user: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>
  lastMessage: Message | null
  isOnline: boolean
  isActive: boolean
  currentUserId: string
}

export function ConversationItem({ user, lastMessage, isOnline, isActive, currentUserId }: Props) {
  return (
    <Link href={`/chat/${user.username}`}>
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 ${
          isActive ? 'bg-blue-50' : ''
        }`}
      >
        <div className="relative flex-shrink-0">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.display_name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
              {(user.display_name[0] ?? '?').toUpperCase()}
            </div>
          )}
          <span
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
              isOnline ? 'bg-green-400' : 'bg-gray-300'
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline">
            <span className="font-medium text-sm text-gray-900 truncate">
              {user.display_name}
            </span>
            {lastMessage && (
              <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                {formatTime(lastMessage.created_at)}
              </span>
            )}
          </div>
          {lastMessage && (
            <p
              className={`text-xs truncate ${
                lastMessage.read_at === null && lastMessage.sender_id !== currentUserId
                  ? 'font-semibold text-gray-900'
                  : 'text-gray-500'
              }`}
            >
              {lastMessage.content}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Update `ConversationItem.test.tsx`**

Replace `tests/components/ConversationItem.test.tsx` with:

```tsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConversationItem } from '@/components/conversations/ConversationItem'
import type { Profile, Message } from '@/types'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}))

const profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'> = {
  id: 'user-b',
  display_name: 'Alice',
  avatar_url: null,
  username: 'alice',
}

const unreadMessage: Message = {
  id: 'msg-1',
  sender_id: 'user-a',
  receiver_id: 'user-b',
  content: 'Hey there',
  created_at: '2026-06-04T10:00:00.000Z',
  read_at: null,
}

const readMessage: Message = {
  ...unreadMessage,
  read_at: '2026-06-04T10:01:00.000Z',
}

describe('ConversationItem', () => {
  it('renders the user display name', () => {
    render(
      <ConversationItem user={profile} lastMessage={null} isOnline={false} isActive={false} currentUserId="user-a" />
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('links to /chat/{username}', () => {
    render(
      <ConversationItem user={profile} lastMessage={null} isOnline={false} isActive={false} currentUserId="user-a" />
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/chat/alice')
  })

  it('shows message content when lastMessage is provided', () => {
    render(
      <ConversationItem user={profile} lastMessage={unreadMessage} isOnline={false} isActive={false} currentUserId="user-a" />
    )
    expect(screen.getByText('Hey there')).toBeInTheDocument()
  })

  it('applies font-semibold when read_at is null (unread)', () => {
    render(
      <ConversationItem user={profile} lastMessage={unreadMessage} isOnline={false} isActive={false} currentUserId="user-a" />
    )
    expect(screen.getByText('Hey there')).toHaveClass('font-semibold')
  })

  it('does not apply font-semibold when read_at is set (read)', () => {
    render(
      <ConversationItem user={profile} lastMessage={readMessage} isOnline={false} isActive={false} currentUserId="user-a" />
    )
    expect(screen.getByText('Hey there')).not.toHaveClass('font-semibold')
  })

  it('shows green online indicator when isOnline is true', () => {
    const { container } = render(
      <ConversationItem user={profile} lastMessage={null} isOnline={true} isActive={false} currentUserId="user-a" />
    )
    expect(container.querySelector('.bg-green-400')).toBeInTheDocument()
  })

  it('shows gray offline indicator when isOnline is false', () => {
    const { container } = render(
      <ConversationItem user={profile} lastMessage={null} isOnline={false} isActive={false} currentUserId="user-a" />
    )
    expect(container.querySelector('.bg-gray-300')).toBeInTheDocument()
  })
})
```

- [ ] **Update `ConversationList.tsx` Pick type**

Open `components/conversations/ConversationList.tsx`. Find the Props type:

```ts
type Props = {
  currentUserId: string
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[]
}
```

Replace with:

```ts
type Props = {
  currentUserId: string
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>[]
}
```

Also find the `ConversationSummary` type:

```ts
type ConversationSummary = {
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
  lastMessage: Message
}
```

Replace with:

```ts
type ConversationSummary = {
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>
  lastMessage: Message
}
```

- [ ] **Update `UserCard.tsx`**

Replace `components/nav/UserCard.tsx` with:

```tsx
import Link from 'next/link'
import type { Profile } from '@/types'

type Props = {
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>
  isOnline: boolean
}

export function UserCard({ profile, isOnline }: Props) {
  return (
    <Link href={`/chat/${profile.username}`}>
      <div className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 cursor-pointer rounded-lg mx-1">
        <div className="relative flex-shrink-0">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name}
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
              {(profile.display_name[0] ?? '?').toUpperCase()}
            </div>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-50 ${
              isOnline ? 'bg-green-400' : 'bg-gray-300'
            }`}
          />
        </div>
        <span className="text-sm text-gray-700 truncate">{profile.display_name}</span>
      </div>
    </Link>
  )
}
```

- [ ] **Update `NavSidebar.tsx` Props type**

Open `components/nav/NavSidebar.tsx`. Find the Props type:

```ts
type Props = {
  currentUserId: string
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[]
}
```

Replace with:

```ts
type Props = {
  currentUserId: string
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>[]
}
```

- [ ] **Run all tests**

```bash
npm run test:run
```

Expected: all tests pass (23 existing + 1 new link test = 24 total).

- [ ] **Commit**

```bash
git add components/conversations/ConversationItem.tsx tests/components/ConversationItem.test.tsx components/conversations/ConversationList.tsx components/nav/UserCard.tsx components/nav/NavSidebar.tsx
git commit -m "feat: thread username through components and update chat links"
```

---

## Task 7: Settings Page

**Files:**
- Create: `components/settings/UsernameForm.tsx`
- Create: `app/(chat)/settings/page.tsx`
- Create: `tests/components/UsernameForm.test.tsx`

- [ ] **Write the failing test for `UsernameForm`**

Create `tests/components/UsernameForm.test.tsx`:

```tsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UsernameForm } from '@/components/settings/UsernameForm'

const mockUpdate = vi.fn()
const mockEq = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: mockEq,
      })),
    })),
  })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockEq.mockResolvedValue({ error: null })
})

describe('UsernameForm', () => {
  it('pre-fills the input with the current username', () => {
    render(<UsernameForm currentUserId="user-1" currentUsername="alice" />)
    expect(screen.getByRole('textbox')).toHaveValue('alice')
  })

  it('shows a validation error when username is too short', async () => {
    const user = userEvent.setup()
    render(<UsernameForm currentUserId="user-1" currentUsername="alice" />)
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'ab')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(screen.getByText(/3.30 characters/i)).toBeInTheDocument()
  })

  it('shows a validation error for a reserved username', async () => {
    const user = userEvent.setup()
    render(<UsernameForm currentUserId="user-1" currentUsername="alice" />)
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'login')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(screen.getByText(/reserved/i)).toBeInTheDocument()
  })

  it('shows success message after a successful save', async () => {
    const user = userEvent.setup()
    render(<UsernameForm currentUserId="user-1" currentUsername="alice" />)
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'alice-new')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/username updated/i)).toBeInTheDocument()
  })

  it('shows "already taken" error on Postgres unique violation', async () => {
    mockEq.mockResolvedValue({ error: { code: '23505', message: 'unique violation' } })
    const user = userEvent.setup()
    render(<UsernameForm currentUserId="user-1" currentUsername="alice" />)
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'bob')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/already taken/i)).toBeInTheDocument()
  })
})
```

- [ ] **Run the test to confirm it fails**

```bash
npm run test:run -- tests/components/UsernameForm.test.tsx
```

Expected: fails with "Cannot find module '@/components/settings/UsernameForm'".

- [ ] **Create `components/settings/UsernameForm.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { validateUsername } from '@/lib/utils'

type Props = {
  currentUserId: string
  currentUsername: string
}

export function UsernameForm({ currentUserId, currentUsername }: Props) {
  const [username, setUsername] = useState(currentUsername)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const validationError = validateUsername(username)
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    const { error: dbError } = await supabase
      .from('profiles')
      .update({ username })
      .eq('id', currentUserId)
    setLoading(false)

    if (dbError) {
      setError(dbError.code === '23505' ? 'Username is already taken' : 'Something went wrong. Please try again.')
      return
    }

    setSuccess(true)
  }

  return (
    <div className="max-w-md p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Settings</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setSuccess(false) }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">3–30 characters · lowercase letters, numbers, - and _ only</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">Username updated</p>}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          Save
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Create `app/(chat)/settings/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UsernameForm } from '@/components/settings/UsernameForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  return (
    <UsernameForm
      currentUserId={user.id}
      currentUsername={profile?.username ?? ''}
    />
  )
}
```

- [ ] **Run all tests**

```bash
npm run test:run
```

Expected: all tests pass (24 existing + 5 new = 29 total).

- [ ] **Commit**

```bash
git add components/settings/UsernameForm.tsx "app/(chat)/settings/page.tsx" tests/components/UsernameForm.test.tsx
git commit -m "feat: add settings page with username change form"
```

---

## Task 8: NavSidebar Settings Link

**Files:**
- Modify: `components/nav/NavSidebar.tsx`

- [ ] **Add `Link` import and Settings link to the NavSidebar footer**

Open `components/nav/NavSidebar.tsx`. Add `Link` to the imports at the top:

```ts
import Link from 'next/link'
```

Find the footer section:

```tsx
<div className="p-3 border-t border-gray-100 flex items-center gap-2">
  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
    {(session?.displayName?.[0] ?? '?').toUpperCase()}
  </div>
  <span className="text-sm text-gray-700 truncate flex-1">{session?.displayName}</span>
  <button onClick={handleSignOut} className="text-xs text-gray-400 hover:text-gray-600">
    Sign out
  </button>
</div>
```

Replace it with:

```tsx
<div className="p-3 border-t border-gray-100 flex items-center gap-2">
  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
    {(session?.displayName?.[0] ?? '?').toUpperCase()}
  </div>
  <span className="text-sm text-gray-700 truncate flex-1">{session?.displayName}</span>
  <Link href="/settings" className="text-xs text-gray-400 hover:text-gray-600">
    Settings
  </Link>
  <button onClick={handleSignOut} className="text-xs text-gray-400 hover:text-gray-600">
    Sign out
  </button>
</div>
```

- [ ] **Run all tests**

```bash
npm run test:run
```

Expected: all 29 tests pass.

- [ ] **Commit**

```bash
git add components/nav/NavSidebar.tsx
git commit -m "feat: add Settings link to NavSidebar footer"
```

---

## Task 9: Open PR

- [ ] **Push the branch**

```bash
git push -u origin feat/username-urls
```

- [ ] **Open PR**

```bash
gh pr create \
  --title "feat: username in chat URLs and profile settings page" \
  --body "## Summary
- Adds \`username\` column to \`profiles\` (unique, format-validated, backfilled from email)
- Renames \`/chat/[userId]\` route to \`/chat/[username]\` with username→profile lookup
- Registration form now includes a username field with client-side validation
- New \`/settings\` page lets users change their username (original preserved until Save)
- Settings link added to NavSidebar footer

## Test plan
- [ ] Register a new account — confirm username field is present and validates correctly
- [ ] Confirm chat URL shows username (e.g. \`/chat/alice\`) after navigating to a conversation
- [ ] Confirm clicking a contact in NavSidebar navigates to \`/chat/{username}\`
- [ ] Navigate to \`/settings\`, change username, confirm URL updates on next chat navigation
- [ ] Try a duplicate username in settings — confirm 'already taken' error
- [ ] Try a reserved word (\`login\`) — confirm 'reserved' error
- [ ] All 29 unit tests pass (\`npm run test:run\`)

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered in |
|---|---|
| `username` column with format constraint | Task 2 |
| Reserved words blocked at app level | Task 3 (`validateUsername`) |
| Backfill existing 17 users from email | Task 2 (DO $$ block) |
| Trigger reads `username` from metadata | Task 2 (trigger update) |
| Username field in registration form | Task 4 |
| Passed in `options.data` to `signUp` | Task 4 |
| `23505` error → "Username is already taken" in form | Task 4 (form) + Task 7 (settings) |
| Route renamed to `[username]` | Task 5 |
| Page queries by username, uses `id` downstream | Task 5 |
| Self-chat guard uses UUID comparison | Task 5 (`otherUser.id === user.id`) |
| `username` added to Profile type | Task 3 |
| Layout query includes `username` | Task 5 |
| `ConversationItem` links to `/chat/{username}` | Task 6 |
| `UserCard` links to `/chat/{username}` | Task 6 |
| Settings page with username form | Task 7 |
| Save-only update (original preserved until save) | Task 7 (`UsernameForm`) |
| Settings link in NavSidebar footer | Task 8 |

**Placeholder scan:** None found — all steps have complete code.

**Type consistency:** `Pick<Profile, 'id' \| 'display_name' \| 'avatar_url' \| 'username'>` used consistently in Tasks 6 and 7. `validateUsername` imported from `@/lib/utils` in Tasks 4 and 7. `mockEq` mock shape matches actual Supabase chain (`.from().update().eq()`).
