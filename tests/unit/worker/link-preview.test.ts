import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockUpsert = vi.fn().mockResolvedValue({ error: null })
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ upsert: mockUpsert }),
  }),
}))

async function getProcessor() {
  const mod = await import('@/worker/processors/link-preview')
  return mod
}

describe('fetchOgMetadata', () => {
  beforeEach(() => {
    vi.resetModules()
    mockUpsert.mockReset().mockResolvedValue({ error: null })
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  })

  it('extracts og:title, og:description, og:image from HTML', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(`
        <html><head>
          <meta property="og:title" content="Test Title" />
          <meta property="og:description" content="Test description" />
          <meta property="og:image" content="https://example.com/img.png" />
        </head></html>
      `),
    }))

    const { fetchOgMetadata } = await getProcessor()
    const result = await fetchOgMetadata('https://example.com')

    expect(result).toEqual({
      og_title: 'Test Title',
      og_description: 'Test description',
      og_image_url: 'https://example.com/img.png',
    })
  })

  it('returns null fields when OG tags are absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><head><title>No OG</title></head></html>'),
    }))

    const { fetchOgMetadata } = await getProcessor()
    const result = await fetchOgMetadata('https://example.com')

    expect(result).toEqual({
      og_title: null,
      og_description: null,
      og_image_url: null,
    })
  })

  it('throws when fetch times out (AbortError)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' })
    ))

    const { fetchOgMetadata } = await getProcessor()
    await expect(fetchOgMetadata('https://slow.example.com')).rejects.toThrow()
  })
})

describe('processLinkPreview', () => {
  beforeEach(() => {
    vi.resetModules()
    mockUpsert.mockReset().mockResolvedValue({ error: null })
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('upserts message_metadata with status done on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(`
        <meta property="og:title" content="GitHub" />
      `),
    }))

    const { processLinkPreview } = await getProcessor()
    const job = { data: { messageId: 'msg-1', url: 'https://github.com' } } as any
    await processLinkPreview(job)

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        message_id: 'msg-1',
        url: 'https://github.com',
        status: 'done',
      })
    )
  })

  it('throws (triggering BullMQ retry) when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    const { processLinkPreview } = await getProcessor()
    const job = { data: { messageId: 'msg-1', url: 'https://bad.example.com' } } as any

    await expect(processLinkPreview(job)).rejects.toThrow()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('throws when upsert fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<meta property="og:title" content="Test" />'),
    }))

    mockUpsert.mockResolvedValue({ error: new Error('DB constraint') })

    const { processLinkPreview } = await getProcessor()
    const job = { data: { messageId: 'msg-1', url: 'https://example.com' } } as any

    await expect(processLinkPreview(job)).rejects.toThrow()
  })
})
