export function buildChannelName(uidA: string, uidB: string): string {
  const [min, max] = [uidA, uidB].sort()
  return `dm:${min}:${max}`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
