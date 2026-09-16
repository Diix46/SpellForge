import { eq } from 'drizzle-orm'
import { requireAppUser } from '../../utils/appUser'
import { schema, useDb } from '../../utils/db'
import { deckGame, deckId, DeckInputError, deckName, deckRaw, deckSource, deckTime } from '../../utils/deckInput'
import { genId } from '../../utils/id'

// Create a deck for the signed-in user. Accepts the client's id and times, so
// guest decks keep both when they move to the account. Creating an id that
// already exists answers with that deck when it is the caller's (a retry), and
// 409 when it belongs to someone else, so the client never drops a deck the
// server did not take.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const body = await readBody<Record<string, unknown>>(event).catch(() => ({} as Record<string, unknown>))

  let input
  try {
    const now = Date.now()
    const createdAt = deckTime(body.createdAt, now)
    input = {
      id: deckId(body.id) ?? genId('d_'),
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
  const inserted = await db.insert(schema.decks).values({
    ...input,
    userId: user.id,
    createdAt: new Date(input.createdAt),
    updatedAt: new Date(input.updatedAt),
  }).onConflictDoNothing().returning({ id: schema.decks.id })

  if (!inserted.length) {
    const existing = await db.select().from(schema.decks).where(eq(schema.decks.id, input.id)).get()
    if (!existing || existing.userId !== user.id)
      throw createError({ statusCode: 409, statusMessage: 'Deck id already taken' })
    return { deck: { ...existing, createdAt: existing.createdAt.getTime(), updatedAt: existing.updatedAt.getTime() } }
  }

  return { deck: { ...input, userId: user.id, shareId: null, public: false } }
})
