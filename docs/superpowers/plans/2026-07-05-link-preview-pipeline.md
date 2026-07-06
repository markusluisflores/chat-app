# Link Preview Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an async background pipeline that fetches Open Graph metadata for URLs in messages and renders preview cards below the message bubble.

**Architecture:** A Supabase Database Webhook fires on `messages` INSERT, calling a Next.js API route that enqueues a BullMQ job into Redis. A separate Node.js worker process (Railway) dequeues the job, fetches OG metadata with a 5s timeout, and upserts the result into `message_metadata`. The client subscribes to `message_metadata` Realtime events and renders a `LinkPreviewCard` when data arrives. The message itself is never delayed — preview is additive.

**Tech Stack:** BullMQ 5, ioredis (bundled with BullMQ), node-html-parser, Supabase Realtime, Next.js App Router, Vitest, Playwright

**Design spec:** `docs/superpowers/specs/2026-07-05-link-preview-pipeline-design.md`

## Global Constraints

- Migration filename format: `NNN_name.sql` (sequential) — next is `009_message_metadata.sql`
- `OgMetadata` interface fields must match DB column names exactly: `og_title`, `og_description`, `og_image_url` (all `string | null`)
- Supabase client: `@/lib/supabase/client.ts` in Client Components, `@/lib/supabase/server.ts` in Server Components/Route Handlers — never mix
- Realtime channel cleanup pattern (ADR-005): `channel.teardown(); (supabase.realtime as unknown as { _remove: (ch: typeof channel) => void })._remove(channel)` — never use `supabase.removeChannel()`
- BullMQ `connection` requires `maxRetriesPerRequest: null` and `enableReadyCheck: false`
- Worker retry: `attempts: 3`, `backoff: { type: 'exponential', delay: 2000 }` (2s → 4s → 8s)
- Worker concurrency: `5`
- OG fetch timeout: `5000ms` via `AbortController`
- Job ID format: `` `link-preview:${messageId}:${url}` `` (idempotency key)
- Queue name: `'link-preview'` (string constant exported from `lib/queue.ts`)
- `Message.content` is the field containing message text (confirmed in `types/index.ts`)
- Test runner: `npm run test:run` (single run), `npm run test -- <file>` (single file)
- Never use `supabase.removeChannel()` — see ADR-005
- Webhook secret header: `x-webhook-secret` (compared against `process.env.SUPABASE_WEBHOOK_SECRET`)
- Service role key env var: `SUPABASE_SERVICE_ROLE_KEY` (worker only — never exposed to client)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/009_message_metadata.sql` | Create | Table DDL, RLS, moddatetime trigger, Realtime publication |
| `lib/queue.ts` | Create | Redis connection factory, Queue factory, QUEUE_NAME constant |
| `app/api/webhooks/message-insert/route.ts` | Create | Receives Supabase webhook, detects URLs, enqueues jobs |
| `worker/processors/link-preview.ts` | Create | `fetchOgMetadata` (HTML parse), `processLinkPreview` (BullMQ job handler) |
| `worker/index.ts` | Create | BullMQ Worker entry point — Railway start command targets this file |
| `hooks/useLinkPreviews.ts` | Create | Realtime subscription to `message_metadata`; returns `Map<messageId, OgMetadata>` |
| `components/messages/LinkPreviewCard.tsx` | Create | Renders OG title, description, image; returns null if all fields null |
| `components/chat/MessageBubble.tsx` | Modify | Accept optional `preview?: OgMetadata` prop; render `LinkPreviewCard` below content |
| `components/chat/MessageFeed.tsx` | Modify | Call `useLinkPreviews`, pass preview per message to `MessageBubble` |
| `app/admin/queues/page.tsx` | Create | Server Component showing queue job counts and last 10 failed jobs |
| `tests/unit/webhooks/message-insert.test.ts` | Create | Unit tests for URL detection, signature verification, enqueue logic |
| `tests/unit/worker/link-preview.test.ts` | Create | Unit tests for `fetchOgMetadata` and `processLinkPreview` |
| `tests/unit/hooks/useLinkPreviews.test.ts` | Create | Unit tests for hook Realtime subscription and Map output |
| `tests/unit/components/LinkPreviewCard.test.tsx` | Create | Unit tests for render cases (full data, partial, all null) |
| `tests/e2e/link-preview.spec.ts` | Create | Playwright: send URL message → wait for preview card |
| `package.json` | Modify | Add `bullmq`, `node-html-parser`, `tsx`; add `worker` and `worker:dev` scripts |
| `.github/workflows/e2e.yml` | Modify | Add worker startup as background process before Playwright runs |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/009_message_metadata.sql`

**Interfaces:**
- Produces: `message_metadata` table with columns `id`, `message_id`, `url`, `og_title`, `og_description`, `og_image_url`, `status`, `error`, `created_at`, `updated_at`; unique constraint on `(message_id, url)`; RLS SELECT policy for participants; moddatetime trigger; Realtime publication membership

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/009_message_metadata.sql`:

```sql
-- Enable moddatetime extension (Supabase includes it; this is idempotent)
create extension if not exists moddatetime schema extensions;

create table message_metadata (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references messages(id) on delete cascade,
  url             text not null,
  og_title        text,
  og_description  text,
  og_image_url    text,
  status          text not null default 'pending',
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(message_id, url)
);

-- Auto-update updated_at on every UPDATE
create trigger handle_updated_at
  before update on message_metadata
  for each row execute procedure extensions.moddatetime(updated_at);

-- RLS
alter table message_metadata enable row level security;

-- SELECT: only message participants can read
create policy "Participants can read message metadata"
  on message_metadata for select
  using (
    exists (
      select 1 from messages m
      where m.id = message_metadata.message_id
        and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
    )
  );

-- No INSERT/UPDATE policy — service role bypasses RLS

-- Add to Realtime publication so clients receive INSERT and UPDATE events
alter publication supabase_realtime add table message_metadata;
```

- [ ] **Step 2: Apply migration to staging**

```bash
npx supabase db push --linked
```

Expected output: `Applying migration 009_message_metadata.sql... done`

- [ ] **Step 3: Verify the table was created**

In Supabase Dashboard → Table Editor → verify `message_metadata` exists with all columns. In Authentication → RLS → verify one policy on `message_metadata` (`Participants can read message metadata`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/009_message_metadata.sql
git commit -m "feat: add message_metadata table for link preview pipeline"
```

---

### Task 2: Dependencies and Queue Infrastructure

**Files:**
- Modify: `package.json`
- Create: `lib/queue.ts`
- Create: `tests/unit/lib/queue.test.ts`

**Interfaces:**
- Produces:
  - `QUEUE_NAME: 'link-preview'` — string constant
  - `getRedisConnection(): ConnectionOptions` — returns BullMQ-compatible Redis options parsed from `REDIS_URL`
  - `getLinkPreviewQueue(): Queue` — lazy singleton; returns the shared BullMQ Queue instance

- [ ] **Step 1: Install dependencies**

```bash
npm install bullmq node-html-parser
npm install --save-dev tsx
```

- [ ] **Step 2: Add worker scripts to package.json**

In `package.json`, inside `"scripts"`:

```json
"worker": "tsx worker/index.ts",
"worker:dev": "tsx watch worker/index.ts"
```

- [ ] **Step 3: Write the failing test**

Create `tests/unit/lib/queue.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'

describe('queue infrastructure', () => {
  beforeEach(() => {
    process.env.REDIS_URL = 'redis://:testpass@localhost:6379'
  })

  it('getRedisConnection parses host, port and password from REDIS_URL', async () => {
    const { getRedisConnection } = await import('@/lib/queue')
    const conn = getRedisConnection()
    expect(conn.host).toBe('localhost')
    expect(conn.port).toBe(6379)
    expect(conn.password).toBe('testpass')
    expect(conn.maxRetriesPerRequest).toBeNull()
    expect(conn.enableReadyCheck).toBe(false)
  })

  it('QUEUE_NAME is the literal string link-preview', async () => {
    const { QUEUE_NAME } = await import('@/lib/queue')
    expect(QUEUE_NAME).toBe('link-preview')
  })
})
```

- [ ] **Step 4: Run the test to confirm it fails**

```bash
npm run test -- tests/unit/lib/queue.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/queue'`

- [ ] **Step 5: Implement `lib/queue.ts`**

```ts
import { Queue } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'

export const QUEUE_NAME = 'link-preview' as const

export function getRedisConnection(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379')
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }
}

let _queue: Queue | null = null

export function getLinkPreviewQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: getRedisConnection() })
  }
  return _queue
}
```

- [ ] **Step 6: Run the test to confirm it passes**

```bash
npm run test -- tests/unit/lib/queue.test.ts
```

Expected: PASS — 2 tests passed

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/queue.ts tests/unit/lib/queue.test.ts
git commit -m "feat: add BullMQ queue infrastructure and Redis connection factory"
```

---

### Task 3: Webhook Handler

**Files:**
- Create: `app/api/webhooks/message-insert/route.ts`
- Create: `tests/unit/webhooks/message-insert.test.ts`

**Interfaces:**
- Consumes: `getLinkPreviewQueue()` and `QUEUE_NAME` from `@/lib/queue`
- Produces: `POST /api/webhooks/message-insert` — 401 on bad secret, 200 on success; enqueues one job per URL found in `record.content`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/webhooks/message-insert.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npm run test -- tests/unit/webhooks/message-insert.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement the webhook handler**

Create `app/api/webhooks/message-insert/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getLinkPreviewQueue } from '@/lib/queue'

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
          jobId: `link-preview:${messageId}:${url}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        }
      )
    )
  )

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npm run test -- tests/unit/webhooks/message-insert.test.ts
```

Expected: PASS — 6 tests passed

- [ ] **Step 5: Configure the Supabase Database Webhook (manual)**

In Supabase Dashboard → Database → Webhooks → Create a new webhook:
- Name: `on-message-insert`
- Table: `public.messages`
- Events: `INSERT`
- Webhook URL: `https://<your-railway-app>.up.railway.app/api/webhooks/message-insert`
- HTTP headers: `x-webhook-secret: <value of SUPABASE_WEBHOOK_SECRET>`

Set `SUPABASE_WEBHOOK_SECRET` in Railway environment variables (same value used above).

- [ ] **Step 6: Commit**

```bash
git add app/api/webhooks/message-insert/route.ts tests/unit/webhooks/message-insert.test.ts
git commit -m "feat: add webhook handler to detect URLs and enqueue link preview jobs"
```

---

### Task 4: Worker

**Files:**
- Create: `worker/processors/link-preview.ts`
- Create: `worker/index.ts`
- Create: `tests/unit/worker/link-preview.test.ts`

**Interfaces:**
- Consumes: `QUEUE_NAME`, `getRedisConnection()` from `@/lib/queue`
- Produces:
  - `fetchOgMetadata(url: string): Promise<OgMetadata>` — exported for testing; throws on fetch failure or timeout
  - `processLinkPreview(job: Job<LinkPreviewJob>): Promise<void>` — BullMQ job handler; upserts to `message_metadata` on success; throws to trigger retry on failure
  - `OgMetadata` interface (re-exported from this file): `{ og_title: string | null, og_description: string | null, og_image_url: string | null }`
  - `LinkPreviewJob` interface: `{ messageId: string, url: string }`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/worker/link-preview.test.ts`:

```ts
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
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npm run test -- tests/unit/worker/link-preview.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement `worker/processors/link-preview.ts`**

```ts
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

  await supabase.from('message_metadata').upsert({
    message_id: messageId,
    url,
    ...meta,
    status: 'done',
  })
}
```

- [ ] **Step 4: Implement `worker/index.ts`**

```ts
import { Worker } from 'bullmq'
import { QUEUE_NAME, getRedisConnection } from '@/lib/queue'
import { processLinkPreview } from './processors/link-preview'

const worker = new Worker(QUEUE_NAME, processLinkPreview, {
  connection: getRedisConnection(),
  concurrency: 5,
})

worker.on('completed', (job) => {
  console.log(`[worker] job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message)
})

console.log(`[worker] listening on queue "${QUEUE_NAME}"`)
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
npm run test -- tests/unit/worker/link-preview.test.ts
```

Expected: PASS — 5 tests passed

- [ ] **Step 6: Commit**

```bash
git add worker/ tests/unit/worker/link-preview.test.ts
git commit -m "feat: add BullMQ worker and OG metadata processor"
```

---

### Task 5: `useLinkPreviews` Hook

**Files:**
- Create: `hooks/useLinkPreviews.ts`
- Create: `tests/unit/hooks/useLinkPreviews.test.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/client`
- Produces: `useLinkPreviews(messageIds: string[]): Map<string, OgMetadata>` — initial fetch of existing `done` rows + Realtime subscription for new ones

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/hooks/useLinkPreviews.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npm run test -- tests/unit/hooks/useLinkPreviews.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement `hooks/useLinkPreviews.ts`**

```ts
'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { OgMetadata } from '@/worker/processors/link-preview'

export function useLinkPreviews(messageIds: string[]): Map<string, OgMetadata> {
  const [previews, setPreviews] = useState<Map<string, OgMetadata>>(new Map())
  const supabase = createClient()
  // Stable channel name per hook instance — avoids topic collisions on remount
  const channelRef = useRef(`link-previews:${Math.random().toString(36).slice(2)}`)
  const idsKey = messageIds.join(',')

  useEffect(() => {
    if (messageIds.length === 0) return

    // Initial fetch of already-processed rows
    supabase
      .from('message_metadata')
      .select('message_id, og_title, og_description, og_image_url')
      .in('message_id', messageIds)
      .eq('status', 'done')
      .then(({ data }) => {
        if (!data) return
        setPreviews(
          new Map(
            data.map((row) => [
              row.message_id,
              {
                og_title: row.og_title,
                og_description: row.og_description,
                og_image_url: row.og_image_url,
              },
            ])
          )
        )
      })

    // Subscribe to worker writes as they arrive
    const channel = supabase
      .channel(channelRef.current)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_metadata' },
        (payload) => {
          const row = payload.new as {
            message_id: string
            status: string
            og_title: string | null
            og_description: string | null
            og_image_url: string | null
          }
          if (!messageIds.includes(row.message_id) || row.status !== 'done') return
          setPreviews((prev) => {
            const next = new Map(prev)
            next.set(row.message_id, {
              og_title: row.og_title,
              og_description: row.og_description,
              og_image_url: row.og_image_url,
            })
            return next
          })
        }
      )
      .subscribe()

    return () => {
      channel.teardown()
      ;(supabase.realtime as unknown as { _remove: (ch: typeof channel) => void })._remove(channel)
    }
  }, [idsKey])

  return previews
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npm run test -- tests/unit/hooks/useLinkPreviews.test.ts
```

Expected: PASS — 3 tests passed

- [ ] **Step 5: Commit**

```bash
git add hooks/useLinkPreviews.ts tests/unit/hooks/useLinkPreviews.test.ts
git commit -m "feat: add useLinkPreviews hook for Realtime message_metadata subscription"
```

---

### Task 6: `LinkPreviewCard` Component and Wire-In

**Files:**
- Create: `components/messages/LinkPreviewCard.tsx`
- Create: `tests/unit/components/LinkPreviewCard.test.tsx`
- Modify: `components/chat/MessageBubble.tsx`
- Modify: `components/chat/MessageFeed.tsx`

**Interfaces:**
- Consumes: `OgMetadata` from `@/worker/processors/link-preview`; `useLinkPreviews` from `@/hooks/useLinkPreviews`
- Produces: `LinkPreviewCard({ meta: OgMetadata }): JSX.Element | null`; `MessageBubble` updated to accept `preview?: OgMetadata`; `MessageFeed` wired to `useLinkPreviews`

- [ ] **Step 1: Write the failing tests for `LinkPreviewCard`**

Create `tests/unit/components/LinkPreviewCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LinkPreviewCard } from '@/components/messages/LinkPreviewCard'

const fullMeta = {
  og_title: 'GitHub',
  og_description: 'Where code lives',
  og_image_url: 'https://github.com/og.png',
}

describe('LinkPreviewCard', () => {
  it('renders title and description when both are present', () => {
    render(<LinkPreviewCard meta={fullMeta} />)
    expect(screen.getByText('GitHub')).toBeDefined()
    expect(screen.getByText('Where code lives')).toBeDefined()
  })

  it('renders image when og_image_url is present', () => {
    render(<LinkPreviewCard meta={fullMeta} />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('https://github.com/og.png')
  })

  it('returns null when all fields are null', () => {
    const { container } = render(
      <LinkPreviewCard meta={{ og_title: null, og_description: null, og_image_url: null }} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders without image when og_image_url is null', () => {
    render(<LinkPreviewCard meta={{ ...fullMeta, og_image_url: null }} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('GitHub')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npm run test -- tests/unit/components/LinkPreviewCard.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement `components/messages/LinkPreviewCard.tsx`**

```tsx
import type { OgMetadata } from '@/worker/processors/link-preview'

type Props = {
  meta: OgMetadata
}

export function LinkPreviewCard({ meta }: Props) {
  if (!meta.og_title && !meta.og_description && !meta.og_image_url) {
    return null
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 overflow-hidden max-w-xs">
      {meta.og_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.og_image_url}
          alt=""
          className="w-full h-36 object-cover"
        />
      )}
      <div className="px-3 py-2">
        {meta.og_title && (
          <p className="text-sm font-medium text-gray-900 truncate">{meta.og_title}</p>
        )}
        {meta.og_description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{meta.og_description}</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npm run test -- tests/unit/components/LinkPreviewCard.test.tsx
```

Expected: PASS — 4 tests passed

- [ ] **Step 5: Update `MessageBubble` to accept and render a preview**

Replace the full contents of `components/chat/MessageBubble.tsx`:

```tsx
import type { Message } from '@/types'
import type { OgMetadata } from '@/worker/processors/link-preview'
import { formatTime } from '@/lib/utils'
import { LinkPreviewCard } from '@/components/messages/LinkPreviewCard'

type Props = {
  message: Message
  isSent: boolean
  preview?: OgMetadata
}

export function MessageBubble({ message, isSent, preview }: Props) {
  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm ${
          isSent
            ? 'bg-blue-500 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-900 rounded-bl-sm'
        }`}
      >
        <p>{message.content}</p>
        <span
          className={`text-xs mt-1 block ${
            isSent ? 'text-blue-100' : 'text-gray-400'
          }`}
        >
          {formatTime(message.created_at)}
        </span>
        {preview && <LinkPreviewCard meta={preview} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Update `MessageFeed` to supply previews to each bubble**

Replace the full contents of `components/chat/MessageFeed.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import type { Message } from '@/types'
import { MessageBubble } from './MessageBubble'
import { useMessages } from '@/hooks/useMessages'
import { useLinkPreviews } from '@/hooks/useLinkPreviews'

type Props = {
  initialMessages: Message[]
  currentUserId: string
  otherUserId: string
}

export function MessageFeed({ initialMessages, currentUserId, otherUserId }: Props) {
  const messages = useMessages(initialMessages, currentUserId, otherUserId)
  const previews = useLinkPreviews(messages.map((m) => m.id))
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isSent={message.sender_id === currentUserId}
          preview={previews.get(message.id)}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 7: Run the full test suite to check for regressions**

```bash
npm run test:run
```

Expected: all existing tests pass; 4 new LinkPreviewCard tests pass

- [ ] **Step 8: Commit**

```bash
git add components/messages/LinkPreviewCard.tsx components/chat/MessageBubble.tsx components/chat/MessageFeed.tsx tests/unit/components/LinkPreviewCard.test.tsx
git commit -m "feat: add LinkPreviewCard and wire link previews into MessageFeed"
```

---

### Task 7: Admin Queue Stats Page

**Files:**
- Create: `app/admin/queues/page.tsx`

**Interfaces:**
- Consumes: `getLinkPreviewQueue()` from `@/lib/queue`; `createClient` from `@/lib/supabase/server`

- [ ] **Step 1: Implement `app/admin/queues/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getLinkPreviewQueue } from '@/lib/queue'

export default async function QueuesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const queue = getLinkPreviewQueue()
  const [counts, failedJobs] = await Promise.all([
    queue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    queue.getFailed(0, 9),
  ])

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Queue: link-preview</h1>

      <div className="grid grid-cols-4 gap-4 mb-10">
        {Object.entries(counts).map(([state, count]) => (
          <div key={state} className="rounded-lg border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold">{count}</p>
            <p className="text-sm text-gray-500 mt-1 capitalize">{state}</p>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-4">Failed jobs (last 10)</h2>
      {failedJobs.length === 0 ? (
        <p className="text-gray-500 text-sm">No failed jobs.</p>
      ) : (
        <ul className="space-y-3">
          {failedJobs.map((job) => (
            <li key={job.id} className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm">
              <p className="font-medium text-red-700">Job {job.id}</p>
              <p className="text-gray-600 mt-1">URL: {job.data.url}</p>
              <p className="text-gray-500 mt-1">Error: {job.failedReason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Start dev server (`npm run dev`), navigate to `http://localhost:3000/admin/queues`. Confirm:
- Redirects to `/login` if not authenticated
- Shows job count stats when authenticated (all zeros is fine at this stage)
- No TypeScript errors in terminal

- [ ] **Step 3: Commit**

```bash
git add app/admin/queues/page.tsx
git commit -m "feat: add admin queue stats page at /admin/queues"
```

---

### Task 8: E2E Test and CI Update

**Files:**
- Create: `tests/e2e/link-preview.spec.ts`
- Modify: `.github/workflows/e2e.yml`

**Interfaces:**
- Consumes: Playwright test users from staging Supabase (`playwright-test-a@mailinator.com`, `playwright-test-b@mailinator.com`); Railway staging worker (must be deployed and running before this test passes in CI)

- [ ] **Step 1: Write the Playwright E2E test**

Create `tests/e2e/link-preview.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function loginAs(page: any, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/chat/)
  await page.waitForLoadState('networkidle')
}

test('link preview appears after sending a message with a URL', async ({ page }) => {
  await loginAs(page, 'playwright-test-a@mailinator.com', 'TestPassword123!')

  // Open conversation with test-b
  await page.click('[data-testid="conversation-item"]')
  await page.waitForLoadState('networkidle')

  // Send a message containing a URL with known OG tags
  const urlMessage = `Check this out https://github.com ${Date.now()}`
  await page.fill('textarea', urlMessage)
  await page.keyboard.press('Enter')

  // Wait for the message to appear
  await expect(page.locator('text=' + urlMessage)).toBeVisible({ timeout: 5000 })

  // Find the sent message ID from Supabase (poll until message_metadata row appears)
  const { data: messages } = await supabase
    .from('messages')
    .select('id')
    .ilike('content', '%github.com%')
    .order('created_at', { ascending: false })
    .limit(1)

  const messageId = messages?.[0]?.id
  expect(messageId).toBeTruthy()

  // Poll message_metadata until status = done (max 15s)
  let meta = null
  for (let i = 0; i < 15; i++) {
    const { data } = await supabase
      .from('message_metadata')
      .select('status, og_title')
      .eq('message_id', messageId)
      .eq('status', 'done')
      .maybeSingle()
    if (data) { meta = data; break }
    await page.waitForTimeout(1000)
  }

  expect(meta).not.toBeNull()

  // Assert preview card is visible in the UI
  await expect(page.locator('[data-testid="link-preview-card"]')).toBeVisible({ timeout: 5000 })
})
```

> **Note:** This test requires adding `data-testid="link-preview-card"` to the outermost `<div>` in `LinkPreviewCard.tsx`. Add it now:
>
> ```tsx
> <div data-testid="link-preview-card" className="mt-2 rounded-lg ...">
> ```

- [ ] **Step 2: Add `data-testid` to `LinkPreviewCard`**

In `components/messages/LinkPreviewCard.tsx`, update the outer div:

```tsx
<div data-testid="link-preview-card" className="mt-2 rounded-lg border border-gray-200 overflow-hidden max-w-xs">
```

- [ ] **Step 3: Update `.github/workflows/e2e.yml` to start the worker**

In the step that starts the Next.js app before Playwright, add a parallel worker start. Locate the step that runs `npm run dev` or starts the server and add after it:

```yaml
- name: Start link-preview worker
  run: npm run worker &
  env:
    REDIS_URL: ${{ secrets.STAGING_REDIS_URL }}
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY }}
```

Also add `STAGING_REDIS_URL` and `STAGING_SUPABASE_SERVICE_ROLE_KEY` to GitHub repository secrets (Settings → Secrets and variables → Actions).

- [ ] **Step 4: Run full test suite locally**

```bash
npm run test:run
```

Expected: all unit tests pass

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/link-preview.spec.ts components/messages/LinkPreviewCard.tsx .github/workflows/e2e.yml
git commit -m "feat: add E2E test for link preview pipeline and update CI workflow"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] `message_metadata` table + RLS + moddatetime trigger + Realtime → Task 1
- [x] Queue infrastructure (BullMQ, Redis, connection factory) → Task 2
- [x] Webhook receiver (URL detection, secret verification, enqueue) → Task 3
- [x] Worker (OG fetch, 5s timeout, upsert, retry-on-throw) → Task 4
- [x] `useLinkPreviews` hook (initial fetch + Realtime) → Task 5
- [x] `LinkPreviewCard` component + wire into `MessageFeed`/`MessageBubble` → Task 6
- [x] Bull Board / queue observability → Task 7 (simplified to direct BullMQ API, no Bull Board library)
- [x] E2E test + CI worker startup → Task 8
- [x] Idempotency: job ID format in Task 3; `unique(message_id, url)` + upsert in Task 4
- [x] Graceful degradation: `preview` prop is optional in `MessageBubble`; `LinkPreviewCard` returns null for all-null fields

**Placeholder scan:** None found. All steps contain actual code.

**Type consistency:**
- `OgMetadata` defined once in `worker/processors/link-preview.ts`, imported by `hooks/useLinkPreviews.ts`, `components/messages/LinkPreviewCard.tsx`, and `components/chat/MessageBubble.tsx`
- `LinkPreviewJob` defined once in `worker/processors/link-preview.ts`, used in `worker/index.ts`
- `QUEUE_NAME` defined once in `lib/queue.ts`, consumed by `worker/index.ts` and `app/api/webhooks/message-insert/route.ts`
