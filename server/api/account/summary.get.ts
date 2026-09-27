import { and, desc, eq, sql } from 'drizzle-orm'
import { GAME_IDS } from '../../../shared/game'
import { requireAppUser } from '../../utils/appUser'
import { schema, useDb } from '../../utils/db'

// The account's dashboard, game by game: decks, copies in the collection and
// what they were worth at the last reading (taken each night and on each
// visit of the Value tab), wished cards.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const db = useDb()
  const d = schema.decks
  const c = schema.collectionItems
  const w = schema.wishlistItems
  const s = schema.collectionSnapshots
  const [decks, copies, wishes] = await Promise.all([
    db.select({ game: d.game, n: sql<number>`count(*)` }).from(d).where(eq(d.userId, user.id)).groupBy(d.game).all(),
    db.select({ game: c.game, n: sql<number>`coalesce(sum(${c.quantity}), 0)` }).from(c).where(eq(c.userId, user.id)).groupBy(c.game).all(),
    db.select({ game: w.game, n: sql<number>`count(*)` }).from(w).where(eq(w.userId, user.id)).groupBy(w.game).all(),
  ])
  const last = await Promise.all(GAME_IDS.map(game => db.select({ value: s.value, day: s.day }).from(s).where(and(eq(s.userId, user.id), eq(s.game, game))).orderBy(desc(s.day)).limit(1).get()))
  const of = (rows: { game: string, n: number }[], game: string) => Number(rows.find(r => r.game === game)?.n ?? 0)
  return {
    games: GAME_IDS.map((game, i) => ({
      game,
      decks: of(decks, game),
      copies: of(copies, game),
      wishes: of(wishes, game),
      value: last[i]?.value ?? null,
      valueDay: last[i]?.day ?? null,
    })),
  }
})
