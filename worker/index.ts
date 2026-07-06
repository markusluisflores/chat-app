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
