import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { SitemapUrl } from './sitemap'
import { desc, eq } from 'drizzle-orm'
import { sharedPath } from '../../shared/game'
import * as schema from '../db/schema'

/**
 * The shared decks a sitemap may list: only those their owner listed in
 * Discover. A private share link must never reach a search engine.
 */
export async function listedDeckUrls(db: LibSQLDatabase<typeof schema>, limit: number): Promise<SitemapUrl[]> {
  const rows = await db
    .select({ game: schema.decks.game, shareId: schema.decks.shareId, updatedAt: schema.decks.updatedAt })
    .from(schema.decks)
    .where(eq(schema.decks.public, true))
    .orderBy(desc(schema.decks.updatedAt))
    .limit(limit)
    .all()
  return rows
    .filter(r => r.shareId)
    .map(r => ({ path: sharedPath(r.game, r.shareId!), lastmod: new Date(r.updatedAt) }))
}
