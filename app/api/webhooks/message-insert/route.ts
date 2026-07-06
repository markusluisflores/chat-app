import { NextRequest, NextResponse } from 'next/server'
import { getLinkPreviewQueue } from '@/lib/queue'

/**
 * Webhook handler for Supabase message INSERT events.
 *
 * MANUAL CONFIGURATION REQUIRED:
 * After deploying this handler, configure the Supabase Database Webhook:
 *
 * 1. Go to Supabase Dashboard → Database → Webhooks
 * 2. Create a new webhook with:
 *    - Name: `on-message-insert`
 *    - Table: `public.messages`
 *    - Events: `INSERT`
 *    - Webhook URL: `https://<your-railway-app>.up.railway.app/api/webhooks/message-insert`
 *    - HTTP headers: `x-webhook-secret: <value of SUPABASE_WEBHOOK_SECRET>`
 * 3. Set `SUPABASE_WEBHOOK_SECRET` in Railway environment variables (same value as header above)
 */

// Only http/https — explicitly exclude javascript:, data:, etc.
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g

function extractUrls(content: string): string[] {
  return [...new Set(content.match(URL_REGEX) ?? [])]
}

function verifySecret(request: NextRequest): boolean {
  return (
    request.headers.get('x-webhook-secret') ===
    process.env.SUPABASE_WEBHOOK_SECRET
  )
}

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const content: string | undefined = body?.record?.content
  const messageId: string | undefined = body?.record?.id

  if (!content || !messageId) {
    return NextResponse.json({ ok: true })
  }

  const urls = extractUrls(content)

  if (urls.length === 0) {
    return NextResponse.json({ ok: true })
  }

  const queue = getLinkPreviewQueue()

  await Promise.all(
    urls.map((url) =>
      queue.add(
        'fetch',
        { messageId, url },
        {
          jobId: `link-preview_${messageId}_${url.replace(/:/g, '_')}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        }
      )
    )
  )

  return NextResponse.json({ ok: true })
}
