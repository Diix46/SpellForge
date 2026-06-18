import { desc, eq } from 'drizzle-orm'
import { requireAppUser } from '../../utils/appUser'
import { schema, useDb } from '../../utils/db'

// List the signed-in user's decks (most recently updated first).
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const db = useDb()
  const rows = await db.select().from(schema.decks).where(eq(schema.decks.userId, user.id)).orderBy(desc(schema.decks.updatedAt)).all()
  return { decks: rows }
})
