export function timeAgo(iso) {
  if (!iso) return '-'
  const then = new Date(iso).getTime()
  const now = Date.now()
  const s = Math.max(1, Math.floor((now - then) / 1000))
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ]
  for (const [name, secs] of units) {
    if (s >= secs) {
      const v = Math.floor(s / secs)
      return `${v} ${name}${v > 1 ? 's' : ''} ago`
    }
  }
  return 'just now'
}
