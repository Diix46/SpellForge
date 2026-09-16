/** The HTTP status of a failed `$fetch`, or null for a network failure. */
export function fetchStatus(err: unknown): number | null {
  const status = (err as { statusCode?: unknown, status?: unknown } | null)?.statusCode
    ?? (err as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : null
}

/**
 * Throws the page's error for anything that is not a plain "not found": a card
 * or deck the server could not read is a 503 to retry, never a 404 that would
 * drop the page from search results.
 */
export function unavailable(err: unknown): never {
  throw createError({ statusCode: 503, statusMessage: 'Temporarily unavailable', cause: err, fatal: true })
}
