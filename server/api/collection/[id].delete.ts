import { eq } from 'drizzle-orm'
import { requireOwnedCopy } from '../../utils/collection/copies'
import { schema, useDb } from '../../utils/db'

// Remove a copy line, whatever its quantity.
export default defineEventHandler(async (event) => {
  const id = decodeURIComponent(getRouterParam(event, 'id')!)
  await requireOwnedCopy(event, id)
  await useDb().delete(schema.collectionItems).where(eq(schema.collectionItems.id, id))
  return { removed: id }
})
