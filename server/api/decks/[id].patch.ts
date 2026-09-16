import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../utils/db'
import { requireOwnedDeck } from '../../utils/ownDeck'

interface UpdateDeckBody { name?: string, raw?: string, source?: string | null }

// Update a deck's name/raw/source. Only provided fields change; `game` is
// fixed at creation, since a decklist in one game's format means nothing in
// another's, and is ignored here.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await requireOwnedDeck(event, id)
  const body = await readBody(event).catch(() => ({})) as Partial<UpdateDeckBody>

  const patch: Partial<UpdateDeckBody> & { updatedAt: Date } = { updatedAt: new Date() }
  if (typeof body.name === 'string')
    patch.name = body.name.trim() || 'Nouveau deck'
  if (typeof body.raw === 'string')
    patch.raw = body.raw
  if (typeof body.source === 'string' || body.source === null)
    patch.source = body.source

  await useDb().update(schema.decks).set(patch).where(eq(schema.decks.id, id))
  return { ok: true }
})
