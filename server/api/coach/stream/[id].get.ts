import { streamSession } from '../../../eve/runtime'

// Stream a coach turn's NDJSON events from the in-process Eve runtime to the
// browser. The client (useCoach.ts) reads text/tool/lifecycle events off this.

export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  rateLimit(`coach:stream:${user.id}`, 20, 60_000)

  const id = getRouterParam(event, 'id')
  // Session ids are opaque tokens — validate the shape so junk fails fast.
  if (!id || !/^[\w-]{1,128}$/.test(id))
    throw createError({ statusCode: 400, statusMessage: 'session id invalide' })

  const stream = streamSession(id)
  if (!stream)
    throw createError({ statusCode: 404, statusMessage: 'session introuvable ou déjà consommée' })

  // NDJSON, unbuffered so events arrive incrementally.
  setHeader(event, 'content-type', 'application/x-ndjson')
  setHeader(event, 'cache-control', 'no-cache, no-transform')
  setHeader(event, 'x-accel-buffering', 'no')
  return stream
})
