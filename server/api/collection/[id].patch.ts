import { and, eq, ne } from 'drizzle-orm'
import { MAX_COPIES } from '../../../shared/collection'
import { collectionCards } from '../../utils/collection/cards'
import { copyFields, requireOwnedCopy, withCards } from '../../utils/collection/copies'
import { schema, useDb } from '../../utils/db'

// Edit a copy line. Quantity 0 removes it. A new finish or condition that
// another line of the same printing already has merges the two.
export default defineEventHandler(async (event) => {
  const id = decodeURIComponent(getRouterParam(event, 'id')!)
  const { user, row } = await requireOwnedCopy(event, id)
  const body = (await readBody(event).catch(() => null) ?? {}) as Record<string, unknown>
  const fields = copyFields(body, true)
  const db = useDb()
  const t = schema.collectionItems

  if (fields.quantity === 0) {
    await db.delete(t).where(eq(t.id, id))
    return { copy: null, removed: id }
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
        eq(t.userId, user.id),
        eq(t.game, row.game),
        eq(t.printingId, row.printingId),
        eq(t.finish, finish),
        eq(t.condition, condition),
        ne(t.id, id),
      )).get()
    : undefined

  if (twin) {
    const [merged] = await db.update(t).set({
      quantity: Math.min(twin.quantity + (fields.quantity ?? row.quantity), MAX_COPIES),
      updatedAt: new Date(),
    }).where(eq(t.id, twin.id)).returning()
    await db.delete(t).where(eq(t.id, id))
    const [copy] = await withCards([merged!])
    return { copy, removed: id }
  }
  const [updated] = await db.update(t).set({ ...fields, finish, condition, updatedAt: new Date() }).where(eq(t.id, id)).returning()
  const [copy] = await withCards([updated!])
  return { copy }
})
