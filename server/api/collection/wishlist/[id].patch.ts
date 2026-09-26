import { and, eq } from 'drizzle-orm'
import { requireAppUser } from '../../../utils/appUser'
import { wishFields, withWishData } from '../../../utils/collection/wishlist'
import { schema, useDb } from '../../../utils/db'

// Edit a wish: target price, quantity, any printing or this one, note.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const id = decodeURIComponent(getRouterParam(event, 'id') ?? '')
  const body = (await readBody(event).catch(() => null) ?? {}) as Record<string, unknown>
  const f = wishFields(body, true)
  delete f.finish
  const t = schema.wishlistItems
  const [row] = await useDb().update(t).set(f).where(and(eq(t.id, id), eq(t.userId, user.id))).returning()
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Souhait introuvable' })
  const [item] = await withWishData(user.id, row.game, [row])
  return { item }
})
