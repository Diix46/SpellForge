import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../utils/db'
import { DeckInputError, deckName, deckRaw, deckSource } from '../../utils/deckInput'
import { requireOwnedDeck } from '../../utils/ownDeck'

// Update a deck's name/raw/source. Only provided fields change; `game` is
// fixed at creation, since a decklist in one game's format means nothing in
// another's, and is ignored here.
export default defineEventHandler(async (event) => {
  const id = decodeURIComponent(getRouterParam(event, 'id')!)
  await requireOwnedDeck(event, id)
  const body = await readBody<Record<string, unknown>>(event).catch(() => ({} as Record<string, unknown>))

  const patch: { name?: string, raw?: string, source?: string | null, updatedAt: Date } = { updatedAt: new Date() }
  try {
    const name = deckName(body.name)
    if (name !== undefined)
      patch.name = name || 'Nouveau deck'
    const raw = deckRaw(body.raw)
    if (raw !== undefined)
      patch.raw = raw
    const source = deckSource(body.source)
    if (source !== undefined)
      patch.source = source
  }
  catch (err) {
    if (err instanceof DeckInputError)
      throw createError({ statusCode: 400, statusMessage: err.message })
    throw err
  }

  await useDb().update(schema.decks).set(patch).where(eq(schema.decks.id, id))
  return { ok: true }
})
