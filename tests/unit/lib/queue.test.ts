import { describe, it, expect, beforeEach } from 'vitest'

describe('queue infrastructure', () => {
  beforeEach(() => {
    process.env.REDIS_URL = 'redis://:testpass@localhost:6379'
  })

  it('getRedisConnection parses host, port and password from REDIS_URL', async () => {
    const { getRedisConnection } = await import('@/lib/queue')
    // ConnectionOptions is RedisOptions | ClusterOptions; we always return the
    // RedisOptions variant so cast to its shape for the assertions.
    const conn = getRedisConnection() as unknown as {
      host: string; port: number; password: string
      maxRetriesPerRequest: null; enableReadyCheck: boolean
    }
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
