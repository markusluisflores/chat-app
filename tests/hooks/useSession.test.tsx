import React from 'react'
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useSession } from '@/hooks/useSession'
import { SessionProvider } from '@/context/SessionContext'
import type { Session } from '@/types'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null })),
        })),
      })),
    })),
  })),
}))

const mockSession: Session = {
  userId: 'user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
}

describe('useSession', () => {
  it('returns the session passed as initialSession', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(SessionProvider, { initialSession: mockSession }, children)

    const { result } = renderHook(() => useSession(), { wrapper })
    expect(result.current.session).toEqual(mockSession)
  })

  it('returns null when no initial session', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(SessionProvider, { initialSession: null }, children)

    const { result } = renderHook(() => useSession(), { wrapper })
    expect(result.current.session).toBeNull()
  })
})
