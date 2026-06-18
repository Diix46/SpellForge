import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../../utils/db'
import { genId } from '../../../utils/id'
import { requireOwnedDeck } from '../../../utils/ownDeck'

// Toggle public sharing for an owned deck.
// body: { enabled: boolean }. Returns the current shareId (or null when off).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { deck } = await requireOwnedDeck(event, id)
  const body = await readBody(event).catch(() => ({})) as { enabled?: boolean }
  const enabled = body.enabled !== false // default: enable

  const shareId = enabled ? (deck.shareId ?? genId('s_')) : null
  await useDb().update(schema.decks).set({ shareId, updatedAt: new Date() }).where(eq(schema.decks.id, id))

  return { shareId }
})
