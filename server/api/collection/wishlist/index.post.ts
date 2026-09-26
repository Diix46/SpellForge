import { requireAppUser } from '../../../utils/appUser'
import { collectionCards } from '../../../utils/collection/cards'
import { gameOf } from '../../../utils/collection/copies'
import { wishFields, withWishData } from '../../../utils/collection/wishlist'
import { schema, useDb } from '../../../utils/db'
import { genId } from '../../../utils/id'

// Put a card on the wishlist: { game, printingId, anyPrinting?, finish?,
// quantity?, targetPrice?, note? }. Wished already: its wish is updated.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  rateLimit(`collection:wish:${user.id}`, 120, 60_000)
  const body = (await readBody(event).catch(() => null) ?? {}) as Record<string, unknown>
  const game = gameOf(body.game)
  const printingId = typeof body.printingId === 'string' ? body.printingId.trim() : ''
  if (!(await collectionCards(game, [printingId])).has(printingId))
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Impression inconnue' })
  const f = wishFields(body, false)
  const t = schema.wishlistItems
  const [row] = await useDb().insert(t).values({ id: genId('w_'), userId: user.id, game, printingId, ...f, anyPrinting: f.anyPrinting!, finish: f.finish!, quantity: f.quantity! }).onConflictDoUpdate({ target: [t.userId, t.game, t.printingId, t.finish], set: f }).returning()
  const [item] = await withWishData(user.id, game, [row!])
  return { item }
})
