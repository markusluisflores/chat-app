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

export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(url, { signal: controller.signal })
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

  const { error } = await supabase.from('message_metadata').upsert({
    message_id: messageId,
    url,
    ...meta,
    status: 'done',
  })
  if (error) throw error
}
