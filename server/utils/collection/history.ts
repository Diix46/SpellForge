/**
 * A collection's worth over time: a reading a day per member and game (value,
 * what was paid, copies, cards), and the day's price of each printing and
 * finish anyone owns, from which the cards that moved are read.
 */
import type { CollectionCopy, Finish } from '../../../shared/collection'
import type { GameId } from '../../../shared/game'
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm'
import { summarize, unitValue } from '../../../shared/collection'
import { schema, useDb } from '../db'
import { withCards } from './copies'

/** Today, as the readings name days (UTC). */
export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** The day `days` before `day`. */
export function daysBefore(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return today(d)
}

const CHUNK = 300

/** Take (or retake) a member's reading of the day, and the prices behind it. */
export async function snapshotCollection(userId: string, game: GameId, day = today()): Promise<CollectionCopy[]> {
  const db = useDb()
  const t = schema.collectionItems
  const copies = await withCards(await db.select().from(t).where(and(eq(t.userId, userId), eq(t.game, game))).all())
  const s = summarize(copies)
  const snap = schema.collectionSnapshots
  await db.insert(snap).values({ userId, game, day, value: s.value, paid: s.paid, copies: s.copies, cards: s.cards }).onConflictDoUpdate({ target: [snap.userId, snap.game, snap.day], set: { value: s.value, paid: s.paid, copies: s.copies, cards: s.cards } })

  const prices = new Map<string, { printingId: string, finish: Finish, price: number }>()
  for (const c of copies) {
    const price = unitValue(c.card, c.finish)
    if (price != null)
      prices.set(`${c.printingId}|${c.finish}`, { printingId: c.printingId, finish: c.finish, price })
  }
  const rows = [...prices.values()].map(p => ({ ...p, day }))
  const pt = schema.collectionPrices
  for (let i = 0; i < rows.length; i += CHUNK)
    await db.insert(pt).values(rows.slice(i, i + CHUNK)).onConflictDoUpdate({ target: [pt.printingId, pt.finish, pt.day], set: { price: sql`excluded.price` } })
  return copies
}

/** Every member's reading of the day (the nightly task). */
export async function snapshotAll(day = today()): Promise<number> {
  const t = schema.collectionItems
  const owners = await useDb().selectDistinct({ userId: t.userId, game: t.game }).from(t).all()
  for (const o of owners)
    await snapshotCollection(o.userId, o.game, day)
  return owners.length
}

export interface Mover {
  id: string
  name: string
  printedName: string | null
  set: string
  number: string
  finish: Finish
  thumb: string
  quantity: number
  then: number
  now: number
  /** (now - then) × quantity. */
  delta: number
}

/**
 * The copy lines whose value moved most since `since`: each line's price now
 * against the first one read on or after that day (lines with no older price
 * are left out).
 */
export async function movers(copies: readonly CollectionCopy[], since: string, limit = 5): Promise<{ gainers: Mover[], losers: Mover[] }> {
  const priced = copies.filter(c => unitValue(c.card, c.finish) != null)
  const ids = [...new Set(priced.map(c => c.printingId))]
  const first = new Map<string, { day: string, price: number }>()
  const pt = schema.collectionPrices
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = await useDb().select().from(pt).where(and(inArray(pt.printingId, ids.slice(i, i + CHUNK)), gte(pt.day, since))).orderBy(asc(pt.day)).all()
    for (const r of rows) {
      const k = `${r.printingId}|${r.finish}`
      if (!first.has(k))
        first.set(k, { day: r.day, price: r.price })
    }
  }
  const day = today()
  const out: Mover[] = []
  for (const c of priced) {
    const then = first.get(`${c.printingId}|${c.finish}`)
    const now = unitValue(c.card, c.finish)!
    if (!then || then.day === day || then.price === now)
      continue
    out.push({
      id: c.id,
      name: c.card!.name,
      printedName: c.card!.printedName,
      set: c.card!.set,
      number: c.card!.number,
      finish: c.finish,
      thumb: c.card!.thumb,
      quantity: c.quantity,
      then: then.price,
      now,
      delta: Math.round((now - then.price) * c.quantity * 100) / 100,
    })
  }
  return {
    gainers: out.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, limit),
    losers: out.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, limit),
  }
}
