import { and, eq, isNotNull } from 'drizzle-orm'
import { wishReached } from '../../../../shared/collection'
import { can, GAME_IDS } from '../../../../shared/game'
import { requireAppUser } from '../../../utils/appUser'
import { withWishData } from '../../../utils/collection/wishlist'
import { schema, useDb } from '../../../utils/db'

// The price alerts: in every game, the wished cards whose price today is at or
// under the price the member set for them (the prices move with the nightly
// refresh). Cheapest saving first.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const t = schema.wishlistItems
  const rows = await useDb().select().from(t).where(and(eq(t.userId, user.id), isNotNull(t.targetPrice))).all()
  const games = GAME_IDS.filter(g => can(g, 'prices') && rows.some(r => r.game === g))
  const items = (await Promise.all(games.map(g => withWishData(user.id, g, rows.filter(r => r.game === g))))).flat()
  const deals = items.filter(wishReached).map(w => ({
    id: w.id,
    game: w.game,
    name: w.card?.printedName ?? w.card?.name ?? w.printingId,
    image: w.card?.thumb ?? w.card?.image ?? null,
    price: w.price!,
    target: w.targetPrice!,
  }))
  return { deals: deals.sort((a, b) => (a.price - a.target) - (b.price - b.target)) }
})
