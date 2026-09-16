import { and, desc, eq, like } from 'drizzle-orm'
import { parseGameId } from '../../../shared/game'
import { schema, useDb } from '../../utils/db'

// Public, unauthenticated listing of decks the owner opted to list in the
// Discover gallery. Minimal fields only — no raw decklist, no userId (same
// minimization as /api/shared/:shareId). Optional ?q= filters by deck name,
// ?game= by game.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const game = parseGameId(query.game)

  const conditions = [eq(schema.decks.public, true)]
  if (q)
    conditions.push(like(schema.decks.name, `%${q}%`))
  if (game)
    conditions.push(eq(schema.decks.game, game))

  const rows = await useDb()
    .select({
      name: schema.decks.name,
      game: schema.decks.game,
      updatedAt: schema.decks.updatedAt,
      shareId: schema.decks.shareId,
      ownerDisplayName: schema.users.displayName,
    })
    .from(schema.decks)
    .innerJoin(schema.users, eq(schema.decks.userId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.decks.updatedAt))
    .limit(60)
    .all()

  return { decks: rows }
})
