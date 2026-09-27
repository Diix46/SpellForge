import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../utils/db'
import { requireOwnedDeck } from '../../utils/ownDeck'

export default defineEventHandler(async (event) => {
  const id = decodeURIComponent(getRouterParam(event, 'id')!)
  await requireOwnedDeck(event, id)
  // Its likes too: the cascade needs foreign keys switched on.
  await useDb().batch([
    useDb().delete(schema.deckLikes).where(eq(schema.deckLikes.deckId, id)),
    useDb().delete(schema.decks).where(eq(schema.decks.id, id)),
  ])
  return { ok: true }
})
