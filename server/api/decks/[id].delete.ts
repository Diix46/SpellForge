import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../utils/db'
import { requireOwnedDeck } from '../../utils/ownDeck'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await requireOwnedDeck(event, id)
  await useDb().delete(schema.decks).where(eq(schema.decks.id, id))
  return { ok: true }
})
