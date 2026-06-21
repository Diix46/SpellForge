import process from 'node:process'

// Pipe the Eve coach session's NDJSON event stream back to the browser
// (same-origin). The client reads lifecycle/text/tool events off this.

const EVE_URL = process.env.EVE_COACH_URL || 'http://127.0.0.1:3100'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'session id requis' })

  let upstream: Response
  try {
    upstream = await fetch(`${EVE_URL}/eve/v1/session/${encodeURIComponent(id)}/stream`, {
      headers: { accept: 'application/x-ndjson, text/event-stream' },
    })
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: 'Coach IA indisponible' })
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
