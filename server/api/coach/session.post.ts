import process from 'node:process'

// Same-origin proxy to the Eve coach agent service. The browser talks to our
// Nuxt origin; we forward to the (internal) Eve service so there's no CORS and
// the agent service can stay private. Returns the durable session id to attach
// the stream to (see ./stream/[id].get.ts).

const EVE_URL = process.env.EVE_COACH_URL || 'http://127.0.0.1:3100'
const UPSTREAM_TIMEOUT_MS = 30_000

export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  // The Eve service is internal/trusted. Reject any EVE_COACH_URL that isn't a
  // loopback address so a tampered env var can't turn this route into an open
  // proxy (SSRF) that forwards the user's deck to an arbitrary host.
  assertLoopback(EVE_URL)
  rateLimit(`coach:session:${user.id}`, 20, 60_000)

  const body = await readBody<{ message?: string, continuationToken?: string }>(event).catch(() => null)
  const message = body?.message?.trim()
  if (!message)
    throw createError({ statusCode: 400, statusMessage: 'message requis' })

  // Abort a hung upstream so it can't pin a server connection forever.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${EVE_URL}/eve/v1/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // continuationToken keeps a multi-turn conversation on the same session.
      body: JSON.stringify({ message, continuationToken: body?.continuationToken }),
      signal: controller.signal,
    })
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'Coach IA indisponible (service hors-ligne)' })
  }
  finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw createError({ statusCode: 502, statusMessage: `Coach ${res.status}: ${txt.slice(0, 160)}` })
  }

  const data = await res.json().catch(() => ({})) as { sessionId?: string, continuationToken?: string }
  return {
    sessionId: data.sessionId ?? res.headers.get('x-eve-session-id') ?? '',
    continuationToken: data.continuationToken ?? '',
  }
})
