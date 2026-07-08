import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { PresenceProvider } from '@/context/PresenceContext'
import { usePresence } from '@/hooks/usePresence'

let presenceSyncCallback: (() => void) | null = null
let subscribedCallback: ((status: string) => void) | null = null

const mockTrack = vi.fn().mockResolvedValue(undefined)
const mockTeardown = vi.fn()
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
  teardown: mockTeardown,
  presenceState: mockPresenceState,
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => mockChannel),
    realtime: { _remove: vi.fn() },
  })),
}))

function makeWrapper(userId: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    // eslint-disable-next-line react/no-children-prop -- .ts file can't use JSX; children in props is required by the component's explicit prop type
    return React.createElement(PresenceProvider, { currentUserId: userId, children })
  }
}

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
    mockTrack.mockResolvedValue(undefined)
  })

  it('returns isOnline as false for unknown users initially', () => {
    const { result } = renderHook(() => usePresence(), {
      wrapper: makeWrapper('user-a'),
    })
    expect(result.current.isOnline('user-b')).toBe(false)
  })

  it('tracks the current user when subscribed', async () => {
    renderHook(() => usePresence(), { wrapper: makeWrapper('user-a') })
    await act(async () => {
      subscribedCallback?.('SUBSCRIBED')
    })
    expect(mockTrack).toHaveBeenCalledWith({ userId: 'user-a' })
  })

  it('returns isOnline true after presence sync with that user', () => {
    mockPresenceState.mockReturnValue({
      key1: [{ userId: 'user-b' }],
    })
    const { result } = renderHook(() => usePresence(), {
      wrapper: makeWrapper('user-a'),
    })
    act(() => {
      presenceSyncCallback?.()
    })
    expect(result.current.isOnline('user-b')).toBe(true)
  })
})
