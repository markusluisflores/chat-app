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
