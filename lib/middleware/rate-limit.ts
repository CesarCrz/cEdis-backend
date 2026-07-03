interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Returns true if the request is allowed, false if rate limit exceeded
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  if (process.env.RATE_LIMIT_ENABLED === 'false') return true

  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false

  entry.count++
  return true
}

export function getRateLimitKey(req: Request, suffix: string): string {
  const forwarded = (req.headers as Headers).get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown'
  return `${ip}:${suffix}`
}
