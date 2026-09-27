import { and, desc, eq, sql } from 'drizzle-orm'
import { GAME_IDS } from '../../../shared/game'
import { highlights, tradeList } from '../../utils/collection/showcase'
import { schema, useDb } from '../../utils/db'

// A member's public profile: their name, the decks they listed in Discover
// (with their likes), their showcase and trade list, and — only if they opened
// it — their collection's worth and finest cards. Never the email or user id.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^p_[\w-]{6,40}$/.test(id))
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  const db = useDb()
  const u = schema.users
  const user = await db.select({ id: u.id, name: u.displayName, since: u.createdAt, open: u.profilePublic, collection: u.collectionPublic })
    .from(u)
    .where(eq(u.profileId, id))
    .get()
  if (!user?.open)
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Profil introuvable ou privé' })

  const d = schema.decks
  const l = schema.deckLikes
  const decks = await db.select({ name: d.name, game: d.game, shareId: d.shareId, updatedAt: d.updatedAt, likes: sql<number>`(SELECT count(*) FROM ${l} WHERE ${l.deckId} = ${d.id})` })
    .from(d)
    .where(and(eq(d.userId, user.id), eq(d.public, true)))
    .orderBy(desc(d.updatedAt))
    .all()
  const worlds = await Promise.all(GAME_IDS.map(async game => ({ game, ...(await highlights(user.id, game, user.collection ? 6 : 0)) })))
  return {
    name: user.name,
    since: user.since.getTime(),
    decks,
    showcase: worlds.flatMap(w => w.showcase),
    trades: await tradeList(user.id),
    collection: user.collection
      ? worlds.filter(w => w.copies > 0).map(w => ({ game: w.game, copies: w.copies, value: w.value, finest: w.finest }))
      : null,
  }
})
