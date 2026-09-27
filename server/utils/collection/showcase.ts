/**
 * What a collector shows: the worth of a collection today and a month ago,
 * its finest cards (the dearest copies), and the cards picked for the
 * showcase. For the member's own collection and for their public profile.
 */
import type { CollectionCopy } from '../../../shared/collection'
import type { GameId } from '../../../shared/game'
import { and, desc, eq, gt, lte } from 'drizzle-orm'
import { unitValue } from '../../../shared/collection'
import { schema, useDb } from '../db'
import { withCards } from './copies'
import { daysBefore, today } from './history'

export interface ShownCopy {
  id: string
  game: GameId
  name: string
  image: string | null
  set: string
  setName: string | null
  number: string
  rarity: string | null
  finish: CollectionCopy['finish']
  condition: CollectionCopy['condition']
  lang: 'fr' | 'en'
  quantity: number
  /** One copy, today. */
  value: number | null
}

export function shown(c: CollectionCopy): ShownCopy {
  return {
    id: c.id,
    game: c.game,
    name: c.card?.printedName ?? c.card?.name ?? c.printingId,
    image: c.card?.image ?? null,
    set: c.card?.set ?? '',
    setName: c.card?.setName ?? null,
    number: c.card?.number ?? '',
    rarity: c.card?.rarity ?? null,
    finish: c.finish,
    condition: c.condition,
    lang: c.lang,
    quantity: c.quantity,
    value: unitValue(c.card, c.finish),
  }
}

/** A game's collection as a collector shows it off. */
export async function highlights(userId: string, game: GameId, finest = 12) {
  const t = schema.collectionItems
  const copies = await withCards(await useDb().select().from(t).where(and(eq(t.userId, userId), eq(t.game, game))).all())
  let value = 0
  for (const c of copies)
    value += (unitValue(c.card, c.finish) ?? 0) * c.quantity
  // A month ago: the reading nearest before that day.
  const s = schema.collectionSnapshots
  const before = await useDb().select({ value: s.value, day: s.day }).from(s).where(and(eq(s.userId, userId), eq(s.game, game), lte(s.day, daysBefore(today(), 30)))).orderBy(desc(s.day)).limit(1).get()
  const ranked = copies.map(shown).filter(c => c.value != null).sort((a, b) => b.value! - a.value!)
  const showcase = copies.filter(c => c.featured > 0).sort((a, b) => a.featured - b.featured).map(shown)
  return {
    value: Math.round(value * 100) / 100,
    before: before ? { value: before.value, day: before.day } : null,
    copies: copies.reduce((n, c) => n + c.quantity, 0),
    finest: ranked.slice(0, finest),
    showcase,
  }
}

/** The copies a member offers to trade, every game. */
export async function tradeList(userId: string) {
  const t = schema.collectionItems
  const rows = await useDb().select().from(t).where(and(eq(t.userId, userId), gt(t.forTrade, 0))).all()
  return (await withCards(rows)).map(c => ({ ...shown(c), quantity: c.forTrade }))
}
