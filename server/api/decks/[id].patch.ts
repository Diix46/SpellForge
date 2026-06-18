import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../utils/db'
import { requireOwnedDeck } from '../../utils/ownDeck'

// Update a deck's name/raw/source. Only provided fields change.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await requireOwnedDeck(event, id)
  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof body.name === 'string')
    patch.name = body.name.trim() || 'Nouveau deck'
  if (typeof body.raw === 'string')
    patch.raw = body.raw
  if (typeof body.source === 'string' || body.source === null)
    patch.source = body.source

  await useDb().update(schema.decks).set(patch).where(eq(schema.decks.id, id))
  return { ok: true }
})
