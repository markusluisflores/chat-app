import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePresence } from '@/hooks/usePresence'

let presenceSyncCallback: (() => void) | null = null
let subscribedCallback: ((status: string) => void) | null = null

const mockTrack = vi.fn()
const mockRemoveChannel = vi.fn()
const mockPresenceState = vi.fn()

const mockChannel = {
  on: vi.fn((event: string, _opts: unknown, cb: () => void) => {
    if (event === 'presence') presenceSyncCallback = cb
    return mockChannel
  }),
  subscribe: vi.fn((cb: (status: string) => void) => {
    subscribedCallback = cb
    return mockChannel
  }),
  track: mockTrack,
  presenceState: mockPresenceState,
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
  })),
}))

describe('usePresence', () => {
  beforeEach(() => {
    presenceSyncCallback = null
    subscribedCallback = null
    mockPresenceState.mockReturnValue({})
    vi.clearAllMocks()
    mockChannel.on.mockImplementation((event: string, _opts: unknown, cb: () => void) => {
      if (event === 'presence') presenceSyncCallback = cb
      return mockChannel
    })
    mockChannel.subscribe.mockImplementation((cb: (status: string) => void) => {
      subscribedCallback = cb
      return mockChannel
    })
  })

  it('returns isOnline as false for unknown users initially', () => {
    const { result } = renderHook(() => usePresence('user-a'))
    expect(result.current.isOnline('user-b')).toBe(false)
  })

  it('tracks the current user when subscribed', async () => {
    renderHook(() => usePresence('user-a'))
    await act(async () => {
      subscribedCallback?.('SUBSCRIBED')
    })
    expect(mockTrack).toHaveBeenCalledWith({ userId: 'user-a' })
  })

  it('returns isOnline true after presence sync with that user', () => {
    mockPresenceState.mockReturnValue({
      key1: [{ userId: 'user-b' }],
    })
    const { result } = renderHook(() => usePresence('user-a'))
    act(() => {
      presenceSyncCallback?.()
    })
    expect(result.current.isOnline('user-b')).toBe(true)
  })
})
