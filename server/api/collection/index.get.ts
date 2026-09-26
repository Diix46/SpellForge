import { and, desc, eq } from 'drizzle-orm'
import { summarize } from '../../../shared/collection'
import { requireAppUser } from '../../utils/appUser'
import { gameOf, withCards } from '../../utils/collection/copies'
import { schema, useDb } from '../../utils/db'

// The member's collection for one game (?game=mtg|optcg): every copy line with
// its card, most recently touched first, and the totals.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const game = gameOf(getQuery(event).game)
  const rows = await useDb().select().from(schema.collectionItems).where(and(eq(schema.collectionItems.userId, user.id), eq(schema.collectionItems.game, game))).orderBy(desc(schema.collectionItems.updatedAt)).all()
  const copies = await withCards(rows)
  return { copies, summary: summarize(copies) }
})
