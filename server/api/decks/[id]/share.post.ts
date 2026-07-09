import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../../utils/db'
import { genId } from '../../../utils/id'
import { requireOwnedDeck } from '../../../utils/ownDeck'

// Toggle public sharing for an owned deck.
// body: { enabled: boolean }. Returns the current shareId (or null when off).
// Disabling also unlists the deck from Discover (public requires a live shareId).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { deck } = await requireOwnedDeck(event, id)
  const body = await readBody(event).catch(() => ({})) as { enabled?: boolean }
  const enabled = body.enabled !== false // default: enable

  const shareId = enabled ? (deck.shareId ?? genId('s_')) : null
  const patch: { shareId: string | null, updatedAt: Date, public?: boolean } = { shareId, updatedAt: new Date() }
  if (!enabled)
    patch.public = false

  await useDb().update(schema.decks).set(patch).where(eq(schema.decks.id, id))
  return { shareId }
})
