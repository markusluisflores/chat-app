# Link Preview Pipeline — Design Spec

> **Status:** Approved  
> **Date:** 2026-07-05  
> **Feature branch:** to be created

---

## Problem

The chat app delivers messages instantly via Realtime, but message content is plain text only. When a user sends a URL, there is no preview — the recipient sees a raw link. This is a UX gap compared to every major messaging app (WhatsApp, Messenger, Slack, iMessage).

## Solution

An async link preview pipeline. When a message containing a URL is inserted, a background worker fetches the page's Open Graph metadata and stores it in a `message_metadata` table. The client subscribes to that table via Realtime and renders a preview card when the data arrives. The message itself is never delayed.

---

## System Flow

```
[Client]                [Next.js]              [Railway]           [Supabase]
   │                       │                       │                    │
   │── send message ──────▶│                       │                    │
   │                       │── INSERT messages ───────────────────────▶│
   │                       │                       │                    │── DB Webhook fires
   │◀── Realtime msg ───────────────────────────────────────────────────│
   │                       │◀── POST /api/webhooks/message-insert ──────│
   │                       │── detect URLs         │                    │
   │                       │── enqueue job ───────▶│ BullMQ/Redis       │
   │                       │                       │                    │
   │                       │                  [Worker process]          │
   │                       │                  dequeue job               │
   │                       │                  fetch URL (OG tags)       │
   │                       │                  ──── upsert message_metadata ──▶│
   │                       │                       │                    │── Realtime fires
   │◀── Realtime metadata ──────────────────────────────────────────────│
   │render preview card    │                       │                    │
```

**Key invariant:** the message is complete on its own. If the worker fails or the URL has no OG metadata, the message still delivers and the preview simply never appears. This is intentional graceful degradation — the preview is additive, never load-bearing.

---

## Data Model

### Migration: `message_metadata`

```sql
create table message_metadata (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references messages(id) on delete cascade,
  url             text not null,
  og_title        text,
  og_description  text,
  og_image_url    text,
  status          text not null default 'pending', -- pending | done | error
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(message_id, url)
);
```

### RLS Policies

- **SELECT:** participants only — join to `messages`, check `sender_id = auth.uid() OR receiver_id = auth.uid()`
- **INSERT / UPDATE:** service role only — the worker authenticates with `SUPABASE_SERVICE_ROLE_KEY`; clients never write to this table

### Realtime

Enable Realtime on `message_metadata` so the client receives the enriched row the moment the worker writes it.

---

## Queue Configuration

### Job payload

```ts
interface LinkPreviewJob {
  messageId: string
  url: string
}
```

### Producer (API route)

```ts
await queue.add(
  'fetch',
  { messageId, url },
  {
    jobId: `link-preview:${messageId}:${url}`,  // idempotency key
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  }
)
```

### Worker

```ts
const worker = new Worker('link-preview', async (job) => {
  const { messageId, url } = job.data
  const meta = await fetchOgMetadata(url)  // 5s timeout
  await supabase.from('message_metadata').upsert({
    message_id: messageId,
    url,
    ...meta,
    status: 'done',
  })
}, { connection: redisConnection, concurrency: 5 })
```

### Retry policy

| Attempt | Delay |
|---|---|
| 1 | immediate |
| 2 | 2s |
| 3 | 4s |
| exhausted | → BullMQ `failed` set (DLQ) |

### Idempotency

Two layers prevent duplicate processing:
1. **BullMQ job ID** `link-preview:${messageId}:${url}` — if the Supabase webhook fires twice (at-least-once delivery), the second enqueue is rejected by BullMQ before the job enters the queue
2. **`unique(message_id, url)` + upsert** — if a duplicate job reaches the worker anyway, the DB write is a no-op overwrite rather than a duplicate row

---

## Infrastructure

### New Railway services

| Service | Type | Start command |
|---|---|---|
| Redis | Railway native plugin | managed |
| `worker` | Node.js process, same repo | `node worker/index.js` |

### New environment variables

| Variable | Service | Purpose |
|---|---|---|
| `REDIS_URL` | web + worker | auto-injected by Railway when Redis is attached |
| `SUPABASE_SERVICE_ROLE_KEY` | worker only | write to `message_metadata` as service role |
| `SUPABASE_WEBHOOK_SECRET` | web | verify webhook calls are from Supabase |

### File structure

```
worker/
  index.ts                          ← entry point for Railway worker service
  processors/
    link-preview.ts                 ← OG fetch logic
lib/
  queue.ts                          ← shared BullMQ connection + queue definition
app/api/
  webhooks/
    message-insert/
      route.ts                      ← receives Supabase DB webhook, enqueues job
components/
  messages/
    LinkPreviewCard.tsx             ← renders OG metadata below message bubble
hooks/
  useLinkPreviews.ts                ← subscribes to message_metadata Realtime changes
```

### Bull Board

Mount at `/admin/queues` in the Next.js app behind an auth check. Provides a live view of queue depth, active jobs, throughput, and failed jobs.

---

## Error Handling

### Failure modes

| Failure | Behaviour |
|---|---|
| URL fetch fails (network, timeout, 404) | BullMQ retries 3× with exponential backoff; job moves to `failed` set; `message_metadata.status` stays `pending`; client renders nothing |
| Webhook fires but Redis is down | API route returns 500; Supabase retries webhook delivery; resolves when Redis recovers |
| Worker crashes mid-job | Visibility timeout expires; job re-surfaces for another worker instance; no manual intervention |
| URL has no OG tags | Worker writes row with null `og_title/description/image`, `status: done`; client renders nothing (treats null fields as no preview) |

### Observability

- **Bull Board** — live queue state, failed job inspection, manual re-queue
- **`message_metadata.status` + `error` columns** — queryable from Supabase dashboard without touching Railway
- Worker logs to Railway's built-in log stream

---

## Testing

### Unit tests (Vitest)

| What | How |
|---|---|
| URL detection regex | standard URLs, URLs mid-sentence, multiple URLs, no URLs, `javascript:` and `data:` inputs |
| `fetchOgMetadata` | mock HTTP fetch; test success, 404, timeout, malformed HTML, missing OG tags |
| Webhook handler | valid secret → 200 + enqueues; invalid secret → 401; no URL in message → 200 + skips |
| Worker processor | mock Supabase upsert; assert correct payload shape on success and on fetch failure |

### Integration tests

- Local Redis via Docker (`docker run -p 6379:6379 redis`)
- Enqueue a real job, run the worker, assert `message_metadata` row written to staging Supabase

### E2E tests (Playwright)

- Playwright test user sends a message containing `https://github.com`
- Poll `message_metadata` via Supabase client until row appears (10s timeout)
- Assert preview card renders in the UI

### CI

Add worker startup as a background process in the E2E workflow step alongside the existing Next.js app startup.

### TDD approach

Every task in the implementation plan follows: write failing test → confirm it fails → implement minimal code → confirm tests pass → commit. Tests are written before implementation at every layer.

---

## Decisions

| Question | Chosen | Why | Tradeoff accepted |
|---|---|---|---|
| Queue technology | BullMQ + Redis | Full queue semantics: job states, retry backoff, DLQ, concurrency, Bull Board | Additional Railway service ($5/mo Hobby plan) |
| Trigger mechanism | Supabase Database Webhook → API route | Server-to-server, reliable, no client involvement in enqueueing | Webhook secret management |
| Delivery guarantee approach | At-least-once + idempotent consumer | Simpler than exactly-once; idempotency key + upsert handles duplicates safely | Duplicate webhook calls require two-layer deduplication |
| Failure mode for worker errors | Graceful degradation (no preview) | Message is never affected; preview is additive | Some previews silently never appear if DLQ not monitored |
| OG fetch timeout | 5s | Prevents slow URLs from blocking a worker slot indefinitely | Fast pages with slow OG endpoints may miss preview |
| Worker concurrency | 5 | Safe for public OG fetches without rate limit concern | May need tuning if worker is extended to rate-limited APIs |
