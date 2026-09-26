import { eq } from 'drizzle-orm'
import { checkCurrentPassword, requireAccount } from '../../utils/account'
import { schema, useDb } from '../../utils/db'

// Delete the account, its decks and its collection, for good, then end the session. The
// password confirms it is the owner asking.
export default defineEventHandler(async (event) => {
  const user = await requireAccount(event)
  const body = (await readBody(event).catch(() => null) ?? {}) as Record<string, unknown>
  await checkCurrentPassword(user, body.password)
  const db = useDb()
  // The decks explicitly: the cascade needs foreign keys switched on.
  await db.batch([
    db.delete(schema.collectionItems).where(eq(schema.collectionItems.userId, user.id)),
    db.delete(schema.collectionImports).where(eq(schema.collectionImports.userId, user.id)),
    db.delete(schema.collectionSnapshots).where(eq(schema.collectionSnapshots.userId, user.id)),
    db.delete(schema.decks).where(eq(schema.decks.userId, user.id)),
    db.delete(schema.users).where(eq(schema.users.id, user.id)),
  ])
  await clearUserSession(event)
  return { ok: true }
})
