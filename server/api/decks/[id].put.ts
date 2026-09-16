import { eq } from 'drizzle-orm'
import { requireAppUser } from '../../utils/appUser'
import { schema, useDb } from '../../utils/db'
import { deckGame, deckId, DeckInputError, deckName, deckRaw, deckSource, deckTime } from '../../utils/deckInput'

// Save a whole deck: create it, or update the caller's copy. This is what the
// app sends for every change of a signed-in account, and what it replays after
// a write that could not get through, so it must be safe to send twice. A
// snapshot older than the stored deck changes nothing (another device saved
// later); a deck id owned by someone else is a 409; `game` is fixed at creation.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const body = await readBody<Record<string, unknown>>(event).catch(() => ({} as Record<string, unknown>))

  let input
  try {
    const id = deckId(decodeURIComponent(getRouterParam(event, 'id') ?? ''))
    if (!id)
      throw new DeckInputError('invalid id')
    const now = Date.now()
    const createdAt = deckTime(body.createdAt, now)
    input = {
      id,
      name: deckName(body.name) || 'Nouveau deck',
      game: deckGame(body.game),
      raw: deckRaw(body.raw) ?? '',
      source: deckSource(body.source) ?? null,
      createdAt,
      updatedAt: Math.max(createdAt, deckTime(body.updatedAt, now)),
    }
  }
  catch (err) {
    if (err instanceof DeckInputError)
      throw createError({ statusCode: 400, statusMessage: err.message })
    throw err
  }

  const db = useDb()
  const existing = await db.select().from(schema.decks).where(eq(schema.decks.id, input.id)).get()
  if (existing && existing.userId !== user.id)
    throw createError({ statusCode: 409, statusMessage: 'Deck id already taken' })

  if (!existing) {
    await db.insert(schema.decks).values({
      ...input,
      userId: user.id,
      createdAt: new Date(input.createdAt),
      updatedAt: new Date(input.updatedAt),
    })
    return { saved: true }
  }

  if (input.updatedAt < existing.updatedAt.getTime())
    return { saved: false }

  await db.update(schema.decks).set({
    name: input.name,
    raw: input.raw,
    source: input.source,
    updatedAt: new Date(input.updatedAt),
  }).where(eq(schema.decks.id, input.id))
  return { saved: true }
})
