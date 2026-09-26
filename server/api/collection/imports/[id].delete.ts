import type { BatchItem } from 'drizzle-orm/batch'
import type { Condition, Finish } from '../../../../shared/collection'
import { and, eq, lte, sql } from 'drizzle-orm'
import { requireAppUser } from '../../../utils/appUser'
import { schema, useDb } from '../../../utils/db'

// Undo an import: take back the copies it added (a line edited since keeps
// whatever is left above zero), then forget the import.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const id = decodeURIComponent(getRouterParam(event, 'id') ?? '')
  const db = useDb()
  const imports = schema.collectionImports
  const record = await db.select().from(imports).where(and(eq(imports.id, id), eq(imports.userId, user.id))).get()
  if (!record)
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Import introuvable' })
  // Imports from before copy languages carry none: the printing's own.
  const items = JSON.parse(record.items) as { printingId: string, finish: Finish, condition: Condition, lang?: string, quantity: number }[]
  const t = schema.collectionItems
  const mine = and(eq(t.userId, user.id), eq(t.game, record.game))
  const statements: BatchItem<'sqlite'>[] = [
    ...items.map(i => db.update(t).set({ quantity: sql`${t.quantity} - ${i.quantity}`, updatedAt: new Date() }).where(and(mine, eq(t.printingId, i.printingId), eq(t.finish, i.finish), eq(t.condition, i.condition), eq(t.lang, i.lang ?? '')))),
    db.delete(t).where(and(mine, lte(t.quantity, 0))),
    db.delete(imports).where(eq(imports.id, id)),
  ]
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return { ok: true, copies: record.copies }
})
