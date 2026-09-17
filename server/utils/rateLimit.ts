// Minimal in-memory rate limiter: coach and AI routes (keyed on the user), sign-in,
// sign-up and imports (keyed on the client address). State is per-process, good
// enough for a single-instance deployment; it resets on restart.
// Auto-imported by Nitro (server/utils).

interface Bucket { count: number, resetAt: number }

const buckets = new Map<string, Bucket>()

// Throws 429 when `key` exceeds `max` hits within `windowMs`. The window is
// fixed: it starts on the first hit and fully resets once it expires.
export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now()
  // Keys now include client addresses: drop expired windows so the map stays small.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) {
      if (now >= b.resetAt)
        buckets.delete(k)
    }
  }
  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }

  bucket.count++
  if (bucket.count > max)
    throw createError({ statusCode: 429, statusMessage: 'Too Many Requests', message: 'Trop de requêtes, réessayez dans un instant' })
}
