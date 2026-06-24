import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMessages } from '@/hooks/useMessages'
import type { Message } from '@/types'

let insertCallback: ((payload: { new: Message }) => void) | null = null

// Simulates PostgrestBuilder's lazy fetch — the HTTP request only fires when
// .then() is called. Without this, tests would pass even if .then() is missing
// in the source, masking the "RPC called but no HTTP request sent" bug.
function makeLazyBuilder(thenSpy: ReturnType<typeof vi.fn>) {
  return {
    then(onfulfilled?: (v: unknown) => unknown) {
      thenSpy()
      return Promise.resolve({ data: null, error: null }).then(onfulfilled)
    },
  }
}

const mockRpcThen = vi.fn()
const mockRpc = vi.fn()

const mockChannel = {
  on: vi.fn((_event: string, _opts: unknown, cb: (payload: { new: Message }) => void) => {
    insertCallback = cb
    return mockChannel
  }),
  subscribe: vi.fn(() => mockChannel),
  teardown: vi.fn(),
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => mockChannel),
    realtime: { _remove: vi.fn() },
    rpc: mockRpc,
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
    mockRpcThen.mockReset()
    mockRpc.mockReturnValue(makeLazyBuilder(mockRpcThen))
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

  it('calls mark_messages_read (fires HTTP request) on mount', () => {
    renderHook(() => useMessages([msg1], 'user-a', 'user-b'))
    expect(mockRpc).toHaveBeenCalledWith('mark_messages_read', {
      p_sender_id: 'user-b',
      p_receiver_id: 'user-a',
    })
    // Verify the fetch actually fired — PostgrestBuilder only sends the HTTP
    // request when .then() is consumed. If this fails, the RPC is a no-op.
    expect(mockRpcThen).toHaveBeenCalled()
  })

  it('calls mark_messages_read (fires HTTP request) when a message arrives from the other user', () => {
    renderHook(() => useMessages([msg1], 'user-a', 'user-b'))
    // Reset after mount call so we can assert the realtime-triggered call separately.
    mockRpcThen.mockReset()
    mockRpc.mockReturnValue(makeLazyBuilder(mockRpcThen))

    act(() => {
      insertCallback?.({ new: msg2 }) // msg2 is from user-b → other user
    })
    expect(mockRpc).toHaveBeenCalledWith('mark_messages_read', {
      p_sender_id: 'user-b',
      p_receiver_id: 'user-a',
    })
    expect(mockRpcThen).toHaveBeenCalled()
  })

  it('does not call mark_messages_read when current user sends a message', () => {
    renderHook(() => useMessages([msg1], 'user-a', 'user-b'))
    mockRpc.mockClear()

    const outgoing: Message = {
      ...msg1,
      id: 'msg-3',
      sender_id: 'user-a',
      receiver_id: 'user-b',
    }
    act(() => {
      insertCallback?.({ new: outgoing })
    })
    expect(mockRpc).not.toHaveBeenCalled()
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
