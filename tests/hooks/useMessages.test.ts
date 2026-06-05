import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMessages } from '@/hooks/useMessages'
import type { Message } from '@/types'

let insertCallback: ((payload: { new: Message }) => void) | null = null

const mockChannel = {
  on: vi.fn((_event: string, _opts: unknown, cb: (payload: { new: Message }) => void) => {
    insertCallback = cb
    return mockChannel
  }),
  subscribe: vi.fn(() => mockChannel),
}

const mockRemoveChannel = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
  })),
}))

const msg1: Message = {
  id: 'msg-1',
  sender_id: 'user-a',
  receiver_id: 'user-b',
  content: 'Hello',
  created_at: '2026-06-04T10:00:00.000Z',
  read_at: null,
}

const msg2: Message = {
  id: 'msg-2',
  sender_id: 'user-b',
  receiver_id: 'user-a',
  content: 'Hi back',
  created_at: '2026-06-04T10:01:00.000Z',
  read_at: null,
}

describe('useMessages', () => {
  beforeEach(() => {
    insertCallback = null
    vi.clearAllMocks()
    mockChannel.on.mockImplementation(
      (_event: string, _opts: unknown, cb: (payload: { new: Message }) => void) => {
        insertCallback = cb
        return mockChannel
      }
    )
    mockChannel.subscribe.mockReturnValue(mockChannel)
  })

  it('returns initial messages', () => {
    const { result } = renderHook(() =>
      useMessages([msg1], 'user-a', 'user-b')
    )
    expect(result.current).toHaveLength(1)
    expect(result.current[0].id).toBe('msg-1')
  })

  it('appends a new message from the other user', () => {
    const { result } = renderHook(() =>
      useMessages([msg1], 'user-a', 'user-b')
    )
    act(() => {
      insertCallback?.({ new: msg2 })
    })
    expect(result.current).toHaveLength(2)
    expect(result.current[1].id).toBe('msg-2')
  })

  it('ignores messages not belonging to this conversation', () => {
    const { result } = renderHook(() =>
      useMessages([msg1], 'user-a', 'user-b')
    )
    const irrelevant: Message = {
      ...msg2,
      id: 'msg-3',
      sender_id: 'user-c',
      receiver_id: 'user-d',
    }
    act(() => {
      insertCallback?.({ new: irrelevant })
    })
    expect(result.current).toHaveLength(1)
  })
})
