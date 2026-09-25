import { and, desc, eq } from 'drizzle-orm'
import { parseGameId } from '../../../shared/game'
import { schema, useDb } from '../../utils/db'

// Public, unauthenticated listing of decks the owner opted to list in the
// Discover gallery. The list goes with each deck — what its shared page
// already shows — so the gallery dresses and filters the decks itself
// (commander art, colours, a card inside); never the userId. Optional ?game=.
const LIMIT = 300

export default defineEventHandler(async (event) => {
  const game = parseGameId(getQuery(event).game)

  const conditions = [eq(schema.decks.public, true)]
  if (game)
    conditions.push(eq(schema.decks.game, game))

  const rows = await useDb()
    .select({
      name: schema.decks.name,
      game: schema.decks.game,
      raw: schema.decks.raw,
      createdAt: schema.decks.createdAt,
      updatedAt: schema.decks.updatedAt,
      shareId: schema.decks.shareId,
      ownerDisplayName: schema.users.displayName,
    })
    .from(schema.decks)
    .innerJoin(schema.users, eq(schema.decks.userId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.decks.updatedAt))
    .limit(LIMIT)
    .all()

  return { decks: rows }
})
