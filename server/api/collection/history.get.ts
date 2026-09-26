import { and, asc, eq, gte } from 'drizzle-orm'
import { requireAppUser } from '../../utils/appUser'
import { gameOf } from '../../utils/collection/copies'
import { daysBefore, movers, snapshotCollection, today } from '../../utils/collection/history'
import { schema, useDb } from '../../utils/db'

const PERIODS: Record<string, number | null> = { 30: 30, 90: 90, 365: 365, all: null }

// A collection's worth over a period (?game=, &days=30|90|365|all): a reading
// a day, today's retaken now so the chart ends on the current value, and the
// cards that moved most since the start.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const q = getQuery(event)
  const game = gameOf(q.game)
  const days = PERIODS[String(q.days ?? '30')] ?? (q.days === 'all' ? null : 30)
  const day = today()
  const since = days == null ? '0000-00-00' : daysBefore(day, days)

  const copies = await snapshotCollection(user.id, game, day)
  const s = schema.collectionSnapshots
  const points = await useDb().select({ day: s.day, value: s.value, paid: s.paid, copies: s.copies, cards: s.cards }).from(s).where(and(eq(s.userId, user.id), eq(s.game, game), gte(s.day, since))).orderBy(asc(s.day)).all()
  return { since, points, movers: await movers(copies, since) }
})
