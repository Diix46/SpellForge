import type { H3Event } from 'h3'
import type { CollectionCopy } from '../../../shared/collection'
import type { GameId } from '../../../shared/game'
import type { CollectionItemRow } from '../../db/schema'
import { and, eq, ne } from 'drizzle-orm'
import { CONDITIONS, FINISHES, isCondition, isFinish, MAX_COPIES } from '../../../shared/collection'
import { parseGameId } from '../../../shared/game'
import { requireAppUser } from '../appUser'
import { schema, useDb } from '../db'
import { collectionCards } from './cards'

export function gameOf(value: unknown): GameId {
  const game = parseGameId(value)
  if (!game)
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Jeu inconnu' })
  return game
}

/** The fields a copy line may be given, checked; `partial` for an edit. */
export function copyFields(body: Record<string, unknown>, partial: boolean) {
  const bad = (message: string): never => {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message })
  }
  const out: Partial<Pick<CollectionItemRow, 'finish' | 'condition' | 'quantity' | 'purchasePrice' | 'location' | 'note'>> = {}
  if (body.finish !== undefined || !partial)
    out.finish = body.finish === undefined ? 'nonfoil' : isFinish(body.finish) ? body.finish : bad(`Finition : ${FINISHES.join(', ')}`)
  if (body.condition !== undefined || !partial)
    out.condition = body.condition === undefined ? 'NM' : isCondition(body.condition) ? body.condition : bad(`État : ${CONDITIONS.join(', ')}`)
  if (body.quantity !== undefined || !partial) {
    const q = body.quantity === undefined ? 1 : Number(body.quantity)
    out.quantity = Number.isInteger(q) && q >= (partial ? 0 : 1) && q <= MAX_COPIES ? q : bad('Quantité invalide')
  }
  if (body.purchasePrice !== undefined) {
    const p = body.purchasePrice === null || body.purchasePrice === '' ? null : Number(body.purchasePrice)
    out.purchasePrice = p === null || (Number.isFinite(p) && p >= 0 && p < 1e6) ? p : bad('Prix d\'achat invalide')
  }
  for (const key of ['location', 'note'] as const) {
    if (body[key] !== undefined) {
      const v = body[key] === null ? null : String(body[key]).trim().slice(0, key === 'note' ? 500 : 80)
      out[key] = v || null
    }
  }
  return out
}

/** A copy line of the signed-in member, or a 404. */
export async function requireOwnedCopy(event: H3Event, id: string) {
  const user = await requireAppUser(event)
  const row = await useDb().select().from(schema.collectionItems).where(and(eq(schema.collectionItems.id, id), eq(schema.collectionItems.userId, user.id))).get()
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Exemplaire introuvable' })
  return { user, row }
}

/** Rows with their cards, as the app shows them. */
export async function withCards(rows: readonly CollectionItemRow[]): Promise<CollectionCopy[]> {
  const byGame = new Map<GameId, string[]>()
  for (const r of rows)
    byGame.set(r.game, [...(byGame.get(r.game) ?? []), r.printingId])
  const cards = new Map<string, Awaited<ReturnType<typeof collectionCards>>>()
  for (const [game, ids] of byGame)
    cards.set(game, await collectionCards(game, [...new Set(ids)]))
  return rows.map(r => ({
    id: r.id,
    game: r.game,
    printingId: r.printingId,
    finish: r.finish,
    condition: r.condition,
    quantity: r.quantity,
    purchasePrice: r.purchasePrice,
    location: r.location,
    note: r.note,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
    card: cards.get(r.game)?.get(r.printingId) ?? null,
  }))
}

type CopyFields = ReturnType<typeof copyFields>

/**
 * Edit a copy line. Quantity 0 removes it. A new finish or condition that
 * another line of the same printing already has merges the two.
 * `removed`: the line id gone (deleted, or merged into `row`).
 */
export async function editCopy(row: CollectionItemRow, fields: CopyFields): Promise<{ row: CollectionItemRow | null, removed?: string }> {
  const db = useDb()
  const t = schema.collectionItems
  if (fields.quantity === 0) {
    await db.delete(t).where(eq(t.id, row.id))
    return { row: null, removed: row.id }
  }
  const finish = fields.finish ?? row.finish
  if (fields.finish && fields.finish !== row.finish) {
    const card = (await collectionCards(row.game, [row.printingId])).get(row.printingId)
    if (card && !card.finishes.includes(finish))
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Cette impression n\'existe pas dans cette finition' })
  }
  const condition = fields.condition ?? row.condition
  const twin = (finish !== row.finish || condition !== row.condition)
    ? await db.select().from(t).where(and(
        eq(t.userId, row.userId),
        eq(t.game, row.game),
        eq(t.printingId, row.printingId),
        eq(t.finish, finish),
        eq(t.condition, condition),
        ne(t.id, row.id),
      )).get()
    : undefined
  if (twin) {
    const [merged] = await db.update(t).set({
      quantity: Math.min(twin.quantity + (fields.quantity ?? row.quantity), MAX_COPIES),
      updatedAt: new Date(),
    }).where(eq(t.id, twin.id)).returning()
    await db.delete(t).where(eq(t.id, row.id))
    return { row: merged!, removed: row.id }
  }
  const [updated] = await db.update(t).set({ ...fields, finish, condition, updatedAt: new Date() }).where(eq(t.id, row.id)).returning()
  return { row: updated! }
}
