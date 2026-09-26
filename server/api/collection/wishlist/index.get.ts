import { and, desc, eq } from 'drizzle-orm'
import { requireAppUser } from '../../../utils/appUser'
import { gameOf } from '../../../utils/collection/copies'
import { withWishData } from '../../../utils/collection/wishlist'
import { schema, useDb } from '../../../utils/db'

// The member's wishlist for one game (?game=), newest first.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const game = gameOf(getQuery(event).game)
  const t = schema.wishlistItems
  const rows = await useDb().select().from(t).where(and(eq(t.userId, user.id), eq(t.game, game))).orderBy(desc(t.createdAt)).all()
  return { items: await withWishData(user.id, game, rows) }
})
