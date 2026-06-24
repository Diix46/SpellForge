// Guard for the Coach proxy: the Eve service is internal/trusted, so its URL
// must resolve to a loopback host. Rejecting anything else stops a tampered
// EVE_COACH_URL from turning the proxy into an open relay (SSRF) that forwards
// the user's deck to an arbitrary host. Auto-imported by Nitro (server/utils).

const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  '::ffff:127.0.0.1',
  '::ffff:7f00:1',
])

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase()
  if (LOOPBACK_HOSTS.has(h))
    return true
  // Any 127.x.x.x address is loopback.
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h))
    return true
  return false
}

// Accepts a full URL or a bare hostname. Throws (same behaviour as the previous
// inline checks) unless the host is loopback.
export function assertLoopback(urlOrHost: string): void {
  let host = ''
  try {
    // Try as a URL first; fall back to treating the input as a bare hostname.
    host = urlOrHost.includes('://') ? new URL(urlOrHost).hostname : urlOrHost
  }
  catch {
    throw createError({ statusCode: 500, statusMessage: 'EVE_COACH_URL invalide' })
  }
  if (!host)
    throw createError({ statusCode: 500, statusMessage: 'EVE_COACH_URL invalide' })
  if (!isLoopbackHost(host))
    throw createError({ statusCode: 500, statusMessage: 'EVE_COACH_URL doit être en loopback' })
}
