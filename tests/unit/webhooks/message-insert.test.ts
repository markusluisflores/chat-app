import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAdd = vi.fn()
vi.mock('@/lib/queue', () => ({
  getLinkPreviewQueue: () => ({ add: mockAdd }),
  QUEUE_NAME: 'link-preview',
}))

async function getHandler() {
  const mod = await import('@/app/api/webhooks/message-insert/route')
  return mod.POST
}

function makeRequest(body: unknown, secret = 'test-secret') {
  return new NextRequest('http://localhost/api/webhooks/message-insert', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-secret': secret,
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/webhooks/message-insert', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAdd.mockReset()
    process.env.SUPABASE_WEBHOOK_SECRET = 'test-secret'
  })

  it('returns 401 when secret header is wrong', async () => {
    const POST = await getHandler()
    const res = await POST(makeRequest({}, 'wrong-secret'))
    expect(res.status).toBe(401)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it('returns 200 and enqueues one job when message contains a URL', async () => {
    const POST = await getHandler()
    const res = await POST(makeRequest({
      record: { id: 'msg-1', content: 'Check https://github.com out' },
    }))
    expect(res.status).toBe(200)
    expect(mockAdd).toHaveBeenCalledOnce()
    expect(mockAdd).toHaveBeenCalledWith(
      'fetch',
      { messageId: 'msg-1', url: 'https://github.com' },
      expect.objectContaining({
        jobId: 'link-preview:msg-1:https://github.com',
        attempts: 3,
      })
    )
  })

  it('enqueues multiple jobs when message contains multiple URLs', async () => {
    const POST = await getHandler()
    await POST(makeRequest({
      record: { id: 'msg-2', content: 'https://github.com and https://example.com' },
    }))
    expect(mockAdd).toHaveBeenCalledTimes(2)
  })

  it('returns 200 and enqueues nothing when message has no URL', async () => {
    const POST = await getHandler()
    const res = await POST(makeRequest({
      record: { id: 'msg-3', content: 'Hello!' },
    }))
    expect(res.status).toBe(200)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it('returns 200 and skips when record is missing content', async () => {
    const POST = await getHandler()
    const res = await POST(makeRequest({ record: { id: 'msg-4' } }))
    expect(res.status).toBe(200)
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it('does not enqueue javascript: or data: URIs', async () => {
    const POST = await getHandler()
    await POST(makeRequest({
      record: { id: 'msg-5', content: 'javascript:alert(1) and data:text/html,hi' },
    }))
    expect(mockAdd).not.toHaveBeenCalled()
  })
})
