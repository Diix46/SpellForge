import { sql } from 'drizzle-orm'
import { MAX_COPIES } from '../../../shared/collection'
import { requireAppUser } from '../../utils/appUser'
import { collectionCards } from '../../utils/collection/cards'
import { copyFields, gameOf, withCards } from '../../utils/collection/copies'
import { schema, useDb } from '../../utils/db'
import { genId } from '../../utils/id'

// Add copies: { game, printingId, finish?, condition?, quantity?, purchasePrice?,
// location?, note? }. Copies of a printing already owned in that finish and
// condition join its line (quantities add up); the rest of the line is kept.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  rateLimit(`collection:add:${user.id}`, 240, 60_000)
  const body = (await readBody(event).catch(() => null) ?? {}) as Record<string, unknown>
  const game = gameOf(body.game)
  const printingId = typeof body.printingId === 'string' ? body.printingId.trim() : ''
  const fields = copyFields(body, false)

  const card = (await collectionCards(game, [printingId])).get(printingId)
  if (!card)
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Impression inconnue' })
  if (!card.finishes.includes(fields.finish!))
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Cette impression n\'existe pas dans cette finition' })

  const t = schema.collectionItems
  const [row] = await useDb().insert(t).values({
    id: genId('c_'),
    userId: user.id,
    game,
    printingId,
    finish: fields.finish!,
    condition: fields.condition!,
    quantity: fields.quantity!,
    purchasePrice: fields.purchasePrice ?? null,
    location: fields.location ?? null,
    note: fields.note ?? null,
  }).onConflictDoUpdate({
    target: [t.userId, t.game, t.printingId, t.finish, t.condition],
    set: {
      quantity: sql`min(${t.quantity} + ${fields.quantity!}, ${MAX_COPIES})`,
      updatedAt: new Date(),
      ...(fields.purchasePrice !== undefined ? { purchasePrice: fields.purchasePrice } : {}),
      ...(fields.location !== undefined ? { location: fields.location } : {}),
      ...(fields.note !== undefined ? { note: fields.note } : {}),
    },
  }).returning()
  const [copy] = await withCards([row!])
  return { copy }
})
