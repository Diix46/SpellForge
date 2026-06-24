// Minimal in-memory rate limiter for authenticated AI/coach routes. Keyed on the
// user id so one account can't hammer the (paid, slow) upstream models. State is
// per-process — good enough for a single-instance deployment; resets on restart.
// Auto-imported by Nitro (server/utils).

interface Bucket { count: number, resetAt: number }

const buckets = new Map<string, Bucket>()

// Throws 429 when `key` exceeds `max` hits within `windowMs`. The window is
// fixed: it starts on the first hit and fully resets once it expires.
export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }

  bucket.count++
  if (bucket.count > max)
    throw createError({ statusCode: 429, statusMessage: 'Trop de requêtes, réessayez dans un instant' })
}
