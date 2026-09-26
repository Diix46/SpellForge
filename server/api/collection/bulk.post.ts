import { and, eq, inArray } from 'drizzle-orm'
import { requireAppUser } from '../../utils/appUser'
import { copyFields, editCopy } from '../../utils/collection/copies'
import { schema, useDb } from '../../utils/db'

const MAX_IDS = 2000

// Several copy lines at once: { ids, action: 'delete' } or
// { ids, action: 'edit', fields: { condition?, location? } }. An edit that
// meets another line merges into it, as a single edit does.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const body = (await readBody(event).catch(() => null) ?? {}) as Record<string, unknown>
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === 'string'))] : []
  if (!ids.length || ids.length > MAX_IDS)
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Sélection invalide' })
  const db = useDb()
  const t = schema.collectionItems
  const owned = and(eq(t.userId, user.id), inArray(t.id, ids))

  if (body.action === 'delete') {
    const gone = await db.delete(t).where(owned).returning({ id: t.id })
    return { removed: gone.map(r => r.id) }
  }
  if (body.action !== 'edit')
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Action inconnue' })

  const input = (body.fields ?? {}) as Record<string, unknown>
  const fields = copyFields({ condition: input.condition, location: input.location }, true)
  if (fields.condition === undefined) {
    // Only the location: one statement.
    await db.update(t).set({ location: fields.location ?? null, updatedAt: new Date() }).where(owned)
    return { removed: [] }
  }
  const removed: string[] = []
  for (const row of await db.select().from(t).where(owned).all()) {
    const result = await editCopy(row, fields)
    if (result.removed)
      removed.push(result.removed)
  }
  return { removed }
})
