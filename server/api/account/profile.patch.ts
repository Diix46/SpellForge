import { eq } from 'drizzle-orm'
import { requireAppUser } from '../../utils/appUser'
import { schema, useDb } from '../../utils/db'
import { genId } from '../../utils/id'

// The public profile's switches: the profile itself, and the collection on it.
// Opening it the first time gives it its address (/joueur/<profileId>).
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const body = (await readBody(event).catch(() => null) ?? {}) as Record<string, unknown>
  const u = schema.users
  const row = await useDb().select({ profileId: u.profileId, open: u.profilePublic, collection: u.collectionPublic }).from(u).where(eq(u.id, user.id)).get()
  const patch = {
    profileId: row?.profileId ?? genId('p_'),
    profilePublic: body.profilePublic === undefined ? !!row?.open : !!body.profilePublic,
    collectionPublic: body.collectionPublic === undefined ? !!row?.collection : !!body.collectionPublic,
  }
  await useDb().update(u).set(patch).where(eq(u.id, user.id))
  return { profile: { id: patch.profileId, public: patch.profilePublic, collectionPublic: patch.collectionPublic } }
})
