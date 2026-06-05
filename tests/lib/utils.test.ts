import { describe, it, expect } from 'vitest'
import { buildChannelName, formatTime } from '@/lib/utils'

describe('buildChannelName', () => {
  it('produces the same name regardless of uid order', () => {
    expect(buildChannelName('aaa', 'bbb')).toBe(buildChannelName('bbb', 'aaa'))
  })

  it('formats as dm:{min}:{max}', () => {
    expect(buildChannelName('bbb', 'aaa')).toBe('dm:aaa:bbb')
  })
})

describe('formatTime', () => {
  it('returns a string matching HH:MM format', () => {
    const result = formatTime('2026-06-04T14:30:00.000Z')
    expect(result).toMatch(/^\d{1,2}:\d{2}/)
  })
})
