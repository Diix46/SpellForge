import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { requireAppUser } from './appUser'
import { schema, useDb } from './db'

// Fetch a deck and assert it belongs to the signed-in user. Throws 404 if not
// found or not owned (don't reveal existence of other users' decks).
export async function requireOwnedDeck(event: H3Event, deckId: string) {
  const user = await requireAppUser(event)
  const deck = await useDb().select().from(schema.decks).where(and(eq(schema.decks.id, deckId), eq(schema.decks.userId, user.id))).get()
  if (!deck)
    throw createError({ statusCode: 404, statusMessage: 'Deck introuvable' })
  return { user, deck }
}
