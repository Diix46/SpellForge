import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../utils/db'

// Public, read-only view of a shared deck. No auth. Returns only the safe
// fields (no owner id). 404 if the share token is unknown/disabled.
export default defineEventHandler(async (event) => {
  const shareId = getRouterParam(event, 'shareId')!
  const deck = await useDb().select({
    name: schema.decks.name,
    raw: schema.decks.raw,
    source: schema.decks.source,
    updatedAt: schema.decks.updatedAt,
  }).from(schema.decks).where(eq(schema.decks.shareId, shareId)).get()

  if (!deck)
    throw createError({ statusCode: 404, statusMessage: 'Deck partagé introuvable' })

  return { deck }
})
