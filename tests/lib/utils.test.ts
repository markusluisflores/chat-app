import { describe, it, expect } from 'vitest'
import { buildChannelName, formatTime, validateUsername } from '@/lib/utils'

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

describe('validateUsername', () => {
  it('returns null for valid usernames', () => {
    expect(validateUsername('alice')).toBeNull()
    expect(validateUsername('alice-dev')).toBeNull()
    expect(validateUsername('alice_99')).toBeNull()
    expect(validateUsername('abc')).toBeNull()
    expect(validateUsername('a'.repeat(30))).toBeNull()
  })

  it('rejects usernames shorter than 3 characters', () => {
    expect(validateUsername('ab')).not.toBeNull()
    expect(validateUsername('a')).not.toBeNull()
  })

  it('rejects usernames longer than 30 characters', () => {
    expect(validateUsername('a'.repeat(31))).not.toBeNull()
  })

  it('rejects uppercase letters', () => {
    expect(validateUsername('Alice')).not.toBeNull()
    expect(validateUsername('ALICE')).not.toBeNull()
  })

  it('rejects spaces and unsupported special characters', () => {
    expect(validateUsername('alice smith')).not.toBeNull()
    expect(validateUsername('alice!')).not.toBeNull()
    expect(validateUsername('alice@example')).not.toBeNull()
  })

  it('rejects the empty string', () => {
    expect(validateUsername('')).not.toBeNull()
  })

  it('rejects reserved words with a specific message', () => {
    expect(validateUsername('login')).toBe('That username is reserved')
    expect(validateUsername('register')).toBe('That username is reserved')
    expect(validateUsername('chat')).toBe('That username is reserved')
    expect(validateUsername('api')).toBe('That username is reserved')
    expect(validateUsername('auth')).toBe('That username is reserved')
    expect(validateUsername('settings')).toBe('That username is reserved')
  })
})
