import process from 'node:process'

// Pipe the Eve coach session's NDJSON event stream back to the browser
// (same-origin). The client reads lifecycle/text/tool events off this.

const EVE_URL = process.env.EVE_COACH_URL || 'http://127.0.0.1:3100'
const UPSTREAM_TIMEOUT_MS = 30_000

export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  // Same loopback guard as session.post — EVE_COACH_URL must point at the
  // internal Eve service, never an attacker-controllable host.
  assertLoopback(EVE_URL)
  rateLimit(`coach:stream:${user.id}`, 20, 60_000)

  const id = getRouterParam(event, 'id')
  // Eve session ids are opaque tokens — validate the shape so a malformed id
  // fails fast instead of hitting the upstream with junk.
  if (!id || !/^[\w-]{1,128}$/.test(id))
    throw createError({ statusCode: 400, statusMessage: 'session id invalide' })

  // Only abort the INITIAL connect (a hung handshake). Once the stream is
  // flowing we must not abort it — it's an open, long-lived event stream.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  let upstream: Response
  try {
    upstream = await fetch(`${EVE_URL}/eve/v1/session/${encodeURIComponent(id)}/stream`, {
      headers: { accept: 'application/x-ndjson, text/event-stream' },
      signal: controller.signal,
    })
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'Coach IA indisponible' })
  }
  finally {
    clearTimeout(timer)
  }
  if (!upstream.ok || !upstream.body) {
    throw createError({ statusCode: 502, statusMessage: `Coach stream ${upstream.status}` })
  }

  // Stream straight through; disable buffering so events arrive incrementally.
  setHeader(event, 'content-type', upstream.headers.get('content-type') || 'application/x-ndjson')
  setHeader(event, 'cache-control', 'no-cache, no-transform')
  setHeader(event, 'x-accel-buffering', 'no')
  return upstream.body
})
