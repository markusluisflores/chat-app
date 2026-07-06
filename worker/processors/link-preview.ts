import { Job } from 'bullmq'
import { createClient } from '@supabase/supabase-js'
import { parse } from 'node-html-parser'

export interface OgMetadata {
  og_title: string | null
  og_description: string | null
  og_image_url: string | null
}

export interface LinkPreviewJob {
  messageId: string
  url: string
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isPrivateUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    // Block localhost and loopback
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true
    // Block cloud metadata endpoints
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') return true
    // Block private IPv4 ranges (simple check — no DNS resolution needed for IP literals)
    const ipv4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
    if (ipv4) {
      const [, a, b] = ipv4.map(Number)
      if (a === 10) return true               // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true  // 172.16.0.0/12
      if (a === 192 && b === 168) return true  // 192.168.0.0/16
    }
    return false
  } catch {
    return true // unparseable URL — block it
  }
}

export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
  if (isPrivateUrl(url)) throw new Error(`Blocked private URL: ${url}`)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
    const html = await response.text()
    const root = parse(html)

    const getOg = (property: string): string | null =>
      root.querySelector(`meta[property="${property}"]`)?.getAttribute('content') ?? null

    return {
      og_title: getOg('og:title'),
      og_description: getOg('og:description'),
      og_image_url: getOg('og:image'),
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function processLinkPreview(job: Job<LinkPreviewJob>): Promise<void> {
  const { messageId, url } = job.data
  // throws on network failure or timeout → BullMQ retries automatically
  const meta = await fetchOgMetadata(url)

  const { error } = await supabase.from('message_metadata').upsert(
    { message_id: messageId, url, ...meta, status: 'done' },
    { onConflict: 'message_id,url' }
  )
  if (error) throw error
}
