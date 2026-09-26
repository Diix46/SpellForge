/**
 * Wishlist rows as the app shows them: the card, today's price (the cheapest
 * printing of the card when any printing will do) and how many copies the
 * collection already holds of it.
 */
import type { Finish, WishItem } from '../../../shared/collection'
import type { GameId } from '../../../shared/game'
import type { WishlistItemRow } from '../../db/schema'
import { and, eq } from 'drizzle-orm'
import { ownershipKey, unitValue } from '../../../shared/collection'
import { useMtgCardsDb } from '../cards/db'
import { schema, useDb } from '../db'
import { collectionCards } from './cards'
import { withCards } from './copies'

/** Cheapest price of each printing's card, over its English and French printings. */
async function cheapest(ids: string[], finish: Finish): Promise<Map<string, number>> {
  if (!ids.length)
    return new Map()
  const col = finish === 'nonfoil' ? 'q.price_eur' : 'COALESCE(q.price_eur_foil, q.price_eur)'
  const { rows } = await useMtgCardsDb().execute({
    sql: `SELECT p.id, (SELECT MIN(${col}) FROM printings q WHERE q.oracle_id = p.oracle_id AND q.lang IN ('en', 'fr')) AS price
            FROM printings p WHERE p.id IN (${ids.map(() => '?').join(',')})`,
    args: ids,
  })
  return new Map(rows.filter(r => r.price != null).map(r => [String(r.id), Number(r.price)]))
}

export async function withWishData(userId: string, game: GameId, rows: readonly WishlistItemRow[]): Promise<WishItem[]> {
  const cards = await collectionCards(game, [...new Set(rows.map(r => r.printingId))])
  const lowest = new Map<string, number>()
  if (game === 'mtg') {
    for (const finish of ['nonfoil', 'foil', 'etched'] as const) {
      const ids = rows.filter(r => r.anyPrinting && r.finish === finish).map(r => r.printingId)
      for (const [id, price] of await cheapest(ids, finish))
        lowest.set(`${id}|${finish}`, price)
    }
  }
  const t = schema.collectionItems
  const copies = await withCards(await useDb().select().from(t).where(and(eq(t.userId, userId), eq(t.game, game))).all())
  const owned = new Map<string, number>()
  for (const c of copies) {
    const name = game === 'mtg' ? c.card?.name : c.card?.number
    if (name)
      owned.set(ownershipKey(game, name), (owned.get(ownershipKey(game, name)) ?? 0) + c.quantity)
  }
  return rows.map((r) => {
    const card = cards.get(r.printingId) ?? null
    const name = game === 'mtg' ? card?.name : card?.number
    return {
      id: r.id,
      game: r.game,
      printingId: r.printingId,
      anyPrinting: r.anyPrinting,
      finish: r.finish,
      quantity: r.quantity,
      targetPrice: r.targetPrice,
      note: r.note,
      createdAt: r.createdAt.getTime(),
      card,
      price: game === 'mtg' ? (r.anyPrinting ? lowest.get(`${r.printingId}|${r.finish}`) ?? null : unitValue(card, r.finish)) : null,
      owned: name ? owned.get(ownershipKey(game, name)) ?? 0 : 0,
    }
  })
}

/** The fields a wish may be given, checked; `partial` for an edit. */
export function wishFields(body: Record<string, unknown>, partial: boolean) {
  const bad = (message: string): never => {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message })
  }
  const out: Partial<Pick<WishlistItemRow, 'anyPrinting' | 'finish' | 'quantity' | 'targetPrice' | 'note'>> = {}
  if (body.anyPrinting !== undefined || !partial)
    out.anyPrinting = body.anyPrinting === undefined ? true : !!body.anyPrinting
  if (body.finish !== undefined || !partial)
    out.finish = body.finish === undefined ? 'nonfoil' : ['nonfoil', 'foil', 'etched'].includes(String(body.finish)) ? body.finish as Finish : bad('Finition inconnue')
  if (body.quantity !== undefined || !partial) {
    const q = body.quantity === undefined ? 1 : Number(body.quantity)
    out.quantity = Number.isInteger(q) && q >= 1 && q <= 99 ? q : bad('Quantité invalide')
  }
  if (body.targetPrice !== undefined) {
    const p = body.targetPrice === null || body.targetPrice === '' ? null : Number(body.targetPrice)
    out.targetPrice = p === null || (Number.isFinite(p) && p >= 0 && p < 1e6) ? p : bad('Prix cible invalide')
  }
  if (body.note !== undefined)
    out.note = body.note === null ? null : String(body.note).trim().slice(0, 300) || null
  return out
}
