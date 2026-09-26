import { and, desc, eq } from 'drizzle-orm'
import { requireAppUser } from '../../../utils/appUser'
import { gameOf } from '../../../utils/collection/copies'
import { schema, useDb } from '../../../utils/db'

// The member's last imports for one game (?game=), newest first, to undo one.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const game = gameOf(getQuery(event).game)
  const t = schema.collectionImports
  const rows = await useDb().select({ id: t.id, format: t.format, filename: t.filename, lines: t.lines, copies: t.copies, createdAt: t.createdAt }).from(t).where(and(eq(t.userId, user.id), eq(t.game, game))).orderBy(desc(t.createdAt)).limit(20).all()
  return { imports: rows.map(r => ({ ...r, createdAt: r.createdAt.getTime() })) }
})
