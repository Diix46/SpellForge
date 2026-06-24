import { startSession } from '../../eve/runtime'

// Start one coach turn against the in-process Eve agent runtime. Returns the
// session id the browser attaches its NDJSON stream to (see ./stream/[id].get.ts)
// plus the continuationToken that keeps a multi-turn conversation in context.

export default defineEventHandler(async (event): Promise<{ sessionId: string, continuationToken: string }> => {
  const user = await requireAppUser(event)
  rateLimit(`coach:session:${user.id}`, 20, 60_000)

  const body = await readBody<{ message?: string, continuationToken?: string }>(event).catch(() => null)
  const message = body?.message?.trim()
  if (!message)
    throw createError({ statusCode: 400, statusMessage: 'message requis' })
  // Cap the input so a giant deck/paste can't blow up the prompt or memory.
  if (message.length > 12_000)
    throw createError({ statusCode: 413, statusMessage: 'message trop long' })

  // Date.now() is read here (in route land) and handed to the time-free runtime.
  return startSession(message, body?.continuationToken, Date.now())
})
