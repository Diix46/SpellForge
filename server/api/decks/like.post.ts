import { and, eq } from 'drizzle-orm'
import { requireAppUser } from '../../utils/appUser'
import { schema, useDb } from '../../utils/db'

// "I like it" on a deck listed in Discover, by its share id: { shareId, liked }.
// A member can't like their own deck; liking twice is liking once.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const body = (await readBody(event).catch(() => null) ?? {}) as { shareId?: string, liked?: boolean }
  const deck = await useDb().select({ id: schema.decks.id, userId: schema.decks.userId, public: schema.decks.public }).from(schema.decks).where(eq(schema.decks.shareId, String(body.shareId ?? ''))).get()
  if (!deck?.public)
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Deck introuvable' })
  if (deck.userId === user.id)
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'C\'est ton propre deck' })
  const l = schema.deckLikes
  if (body.liked === false)
    await useDb().delete(l).where(and(eq(l.userId, user.id), eq(l.deckId, deck.id)))
  else
    await useDb().insert(l).values({ userId: user.id, deckId: deck.id }).onConflictDoNothing()
  const likes = await useDb().$count(l, eq(l.deckId, deck.id))
  return { liked: body.liked !== false, likes }
})
