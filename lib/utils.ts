export function buildChannelName(uidA: string, uidB: string): string {
  const [min, max] = [uidA, uidB].sort()
  return `dm:${min}:${max}`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export const RESERVED_USERNAMES = new Set(['login', 'register', 'chat', 'api', 'auth', 'settings'])

export function validateUsername(username: string): string | null {
  if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
    return '3–30 characters · lowercase letters, numbers, - and _ only'
  }
  if (RESERVED_USERNAMES.has(username)) {
    return 'That username is reserved'
  }
  return null
}
