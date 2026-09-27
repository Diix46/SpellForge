import { and, desc, eq, sql } from 'drizzle-orm'
import { parseGameId } from '../../../shared/game'
import { schema, useDb } from '../../utils/db'

// Public, unauthenticated listing of decks the owner opted to list in the
// Discover gallery. The list goes with each deck — what its shared page
// already shows — so the gallery dresses and filters the decks itself
// (commander art, colours, a card inside); never the userId. Optional ?game=.
// Each deck's likes, whether the member likes it, its owner's public profile.
const LIMIT = 300

export default defineEventHandler(async (event) => {
  const game = parseGameId(getQuery(event).game)
  const session = await getUserSession(event)
  const me = (session.user as { id?: string } | undefined)?.id ?? null
  const l = schema.deckLikes

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
      ownerProfile: sql<string | null>`CASE WHEN ${schema.users.profilePublic} THEN ${schema.users.profileId} END`,
      likes: sql<number>`(SELECT count(*) FROM ${l} WHERE ${l.deckId} = ${schema.decks.id})`,
      liked: sql<number>`EXISTS (SELECT 1 FROM ${l} WHERE ${l.deckId} = ${schema.decks.id} AND ${l.userId} = ${me})`,
      mine: sql<number>`${schema.decks.userId} = ${me}`,
    })
    .from(schema.decks)
    .innerJoin(schema.users, eq(schema.decks.userId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.decks.updatedAt))
    .limit(LIMIT)
    .all()

  return { decks: rows.map(r => ({ ...r, liked: !!r.liked, mine: !!r.mine })) }
})
