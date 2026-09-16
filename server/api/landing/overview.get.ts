/**
 * The landing's real figures and the latest decks listed in Discover. The
 * counts move with the nightly refresh and are cached for an hour; the decks
 * are read on each request (one indexed query) so a new listing shows at once.
 */
import type { LandingOverview } from '../../../shared/landing'
import { count, desc, eq } from 'drizzle-orm'
import { sharedPath } from '../../../shared/game'
import { useMtgCardsDb, useOptcgCardsDb } from '../../utils/cards/db'
import { schema, useDb } from '../../utils/db'

const DECKS = 6

const cardCounts = defineCachedFunction(async () => {
  const [opCards, opArts, mtgCards] = await Promise.all([
    useOptcgCardsDb().execute('SELECT COUNT(*) AS n FROM op_numbers'),
    useOptcgCardsDb().execute('SELECT COUNT(*) AS n FROM op_cards'),
    useMtgCardsDb().execute('SELECT COUNT(*) AS n FROM oracle_cards WHERE legal_commander = 1 AND is_funny = 0'),
  ])
  return {
    optcgCards: Number(opCards.rows[0]?.n ?? 0),
    optcgArts: Number(opArts.rows[0]?.n ?? 0),
    mtgCards: Number(mtgCards.rows[0]?.n ?? 0),
  }
}, { maxAge: 60 * 60, name: 'landing-counts', getKey: () => 'all' })

export default defineEventHandler(async (): Promise<LandingOverview> => {
  const db = useDb()
  const [counts, [publicCount], rows] = await Promise.all([
    // A card database still being built leaves the figures at zero, not the page broken.
    cardCounts().catch(() => ({ optcgCards: 0, optcgArts: 0, mtgCards: 0 })),
    db.select({ n: count() }).from(schema.decks).where(eq(schema.decks.public, true)),
    db.select({
      name: schema.decks.name,
      game: schema.decks.game,
      shareId: schema.decks.shareId,
      updatedAt: schema.decks.updatedAt,
      owner: schema.users.displayName,
    })
      .from(schema.decks)
      .innerJoin(schema.users, eq(schema.decks.userId, schema.users.id))
      .where(eq(schema.decks.public, true))
      .orderBy(desc(schema.decks.updatedAt))
      .limit(DECKS),
  ])
  return {
    stats: { ...counts, publicDecks: publicCount?.n ?? 0 },
    decks: rows.filter(r => r.shareId).map(r => ({
      name: r.name,
      game: r.game,
      owner: r.owner,
      updatedAt: new Date(r.updatedAt).getTime(),
      path: sharedPath(r.game, r.shareId!),
    })),
  }
})
