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
