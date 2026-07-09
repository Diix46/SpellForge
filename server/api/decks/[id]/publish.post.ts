import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../../utils/db'
import { genId } from '../../../utils/id'
import { requireOwnedDeck } from '../../../utils/ownDeck'

// Toggle public listing in the Discover gallery for an owned deck. Enabling
// implicitly ensures a share link exists (Discover always points to
// /shared/:shareId) — it does NOT touch an already-active link. Disabling
// only unlists the deck; the private share link (if any) stays active.
// body: { enabled: boolean }. Returns the current shareId + public flag.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { deck } = await requireOwnedDeck(event, id)
  const body = await readBody(event).catch(() => ({})) as { enabled?: boolean }
  const enabled = body.enabled === true

  if (!enabled) {
    await useDb().update(schema.decks).set({ public: false, updatedAt: new Date() }).where(eq(schema.decks.id, id))
    return { shareId: deck.shareId, public: false }
  }

  const shareId = deck.shareId ?? genId('s_')
  await useDb().update(schema.decks).set({ shareId, public: true, updatedAt: new Date() }).where(eq(schema.decks.id, id))
  return { shareId, public: true }
})
