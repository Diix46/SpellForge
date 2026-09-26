import { and, eq } from 'drizzle-orm'
import { requireAppUser } from '../../../utils/appUser'
import { schema, useDb } from '../../../utils/db'

// Take a card off the wishlist.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const id = decodeURIComponent(getRouterParam(event, 'id') ?? '')
  const t = schema.wishlistItems
  const gone = await useDb().delete(t).where(and(eq(t.id, id), eq(t.userId, user.id))).returning({ id: t.id })
  if (!gone.length)
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Souhait introuvable' })
  return { ok: true }
})
