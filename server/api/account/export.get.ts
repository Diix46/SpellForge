import { eq } from 'drizzle-orm'
import { requireAppUser } from '../../utils/appUser'
import { schema, useDb } from '../../utils/db'

// Everything the account holds, as one JSON file to keep: the profile, the
// decks (their lists as typed), the collection, the wishlist and the value
// readings. Never the password.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const db = useDb()
  const me = await db.select({ email: schema.users.email, displayName: schema.users.displayName, createdAt: schema.users.createdAt })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get()
  const [decks, collection, wishlist, history] = await Promise.all([
    db.select({ name: schema.decks.name, game: schema.decks.game, list: schema.decks.raw, source: schema.decks.source, public: schema.decks.public, createdAt: schema.decks.createdAt, updatedAt: schema.decks.updatedAt })
      .from(schema.decks)
      .where(eq(schema.decks.userId, user.id))
      .all(),
    db.select({ game: schema.collectionItems.game, printingId: schema.collectionItems.printingId, lang: schema.collectionItems.lang, finish: schema.collectionItems.finish, condition: schema.collectionItems.condition, quantity: schema.collectionItems.quantity, purchasePrice: schema.collectionItems.purchasePrice, location: schema.collectionItems.location, note: schema.collectionItems.note, createdAt: schema.collectionItems.createdAt })
      .from(schema.collectionItems)
      .where(eq(schema.collectionItems.userId, user.id))
      .all(),
    db.select({ game: schema.wishlistItems.game, printingId: schema.wishlistItems.printingId, anyPrinting: schema.wishlistItems.anyPrinting, finish: schema.wishlistItems.finish, quantity: schema.wishlistItems.quantity, targetPrice: schema.wishlistItems.targetPrice, note: schema.wishlistItems.note, createdAt: schema.wishlistItems.createdAt })
      .from(schema.wishlistItems)
      .where(eq(schema.wishlistItems.userId, user.id))
      .all(),
    db.select({ game: schema.collectionSnapshots.game, day: schema.collectionSnapshots.day, value: schema.collectionSnapshots.value, paid: schema.collectionSnapshots.paid, copies: schema.collectionSnapshots.copies })
      .from(schema.collectionSnapshots)
      .where(eq(schema.collectionSnapshots.userId, user.id))
      .all(),
  ])
  const day = new Date().toISOString().slice(0, 10)
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="prism-${day}.json"`)
  return { exportedAt: new Date().toISOString(), account: me, decks, collection, wishlist, history }
})
