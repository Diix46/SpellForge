import process from 'node:process'

// Same-origin proxy to the Eve coach agent service. The browser talks to our
// Nuxt origin; we forward to the (internal) Eve service so there's no CORS and
// the agent service can stay private. Returns the durable session id to attach
// the stream to (see ./stream/[id].get.ts).

const EVE_URL = process.env.EVE_COACH_URL || 'http://127.0.0.1:3100'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ message?: string, continuationToken?: string }>(event).catch(() => null)
  const message = body?.message?.trim()
  if (!message)
    throw createError({ statusCode: 400, statusMessage: 'message requis' })

  let res: Response
  try {
    res = await fetch(`${EVE_URL}/eve/v1/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // continuationToken keeps a multi-turn conversation on the same session.
      body: JSON.stringify({ message, continuationToken: body?.continuationToken }),
    })
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'Coach IA indisponible (service hors-ligne)' })
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw createError({ statusCode: 502, statusMessage: `Coach ${res.status}: ${txt.slice(0, 160)}` })
  }

  const data = await res.json() as { sessionId?: string, continuationToken?: string }
  return {
    sessionId: data.sessionId ?? res.headers.get('x-eve-session-id') ?? '',
    continuationToken: data.continuationToken ?? '',
  }
})
