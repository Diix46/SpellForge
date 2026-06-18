import { requireAppUser } from '../../utils/appUser'
import { schema, useDb } from '../../utils/db'
import { genId } from '../../utils/id'

// Create a deck for the signed-in user. Optionally accepts a client id (to
// preserve local deck ids when migrating guest decks on first login).
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>

  const id = typeof body.id === 'string' && body.id ? body.id : genId('d_')
  const name = (typeof body.name === 'string' && body.name.trim()) || 'Nouveau deck'
  const raw = typeof body.raw === 'string' ? body.raw : ''
  const source = typeof body.source === 'string' ? body.source : null
  const now = Date.now()

  await useDb().insert(schema.decks).values({
    id,
    userId: user.id,
    name,
    raw,
    source,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  }).onConflictDoNothing()

  return { deck: { id, userId: user.id, name, raw, source, shareId: null, createdAt: now, updatedAt: now } }
})
