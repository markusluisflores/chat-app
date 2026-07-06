import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const mockSelect = vi.fn()
const mockSubscribe = vi.fn().mockReturnValue({ teardown: vi.fn() })
const mockChannel = vi.fn().mockReturnValue({
  on: vi.fn().mockReturnThis(),
  subscribe: mockSubscribe,
})
const mockRemove = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: mockSelect }),
    channel: mockChannel,
    realtime: { _remove: mockRemove },
  }),
}))

describe('useLinkPreviews', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSelect.mockReset()
    mockChannel.mockClear()
  })

  it('returns empty Map when messageIds is empty', async () => {
    const { useLinkPreviews } = await import('@/hooks/useLinkPreviews')
    const { result } = renderHook(() => useLinkPreviews([]))
    expect(result.current.size).toBe(0)
    expect(mockChannel).not.toHaveBeenCalled()
  })

  it('fetches existing done rows and returns them as a Map', async () => {
    mockSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              message_id: 'msg-1',
              og_title: 'GitHub',
              og_description: 'Where code lives',
              og_image_url: 'https://github.com/og.png',
            },
          ],
        }),
      }),
    })

    const { useLinkPreviews } = await import('@/hooks/useLinkPreviews')
    const { result } = renderHook(() => useLinkPreviews(['msg-1']))

    await waitFor(() => expect(result.current.size).toBe(1))

    expect(result.current.get('msg-1')).toEqual({
      og_title: 'GitHub',
      og_description: 'Where code lives',
      og_image_url: 'https://github.com/og.png',
    })
  })

  it('subscribes to message_metadata Realtime changes', async () => {
    mockSelect.mockReturnValue({
      in: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [] }) }),
    })

    const { useLinkPreviews } = await import('@/hooks/useLinkPreviews')
    renderHook(() => useLinkPreviews(['msg-1']))

    await waitFor(() => expect(mockChannel).toHaveBeenCalled())
    expect(mockSubscribe).toHaveBeenCalled()
  })
})
