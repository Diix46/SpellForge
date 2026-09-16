import type { SitemapUrl } from '../../utils/sitemap'
import { desc, eq } from 'drizzle-orm'
import { sharedPath } from '../../../shared/game'
import { schema, useDb } from '../../utils/db'
import { SITEMAP_MAX_URLS, siteOrigin, urlset } from '../../utils/sitemap'

const STATIC_PAGES = ['/landing', '/one-piece', '/magic', '/discover']

/** The public pages, and the decks their owners listed in Discover. */
export default defineEventHandler(async (event) => {
  const rows = await useDb()
    .select({ game: schema.decks.game, shareId: schema.decks.shareId, updatedAt: schema.decks.updatedAt })
    .from(schema.decks)
    .where(eq(schema.decks.public, true))
    .orderBy(desc(schema.decks.updatedAt))
    .limit(SITEMAP_MAX_URLS - STATIC_PAGES.length)
    .all()

  const urls: SitemapUrl[] = [
    ...STATIC_PAGES.map(path => ({ path })),
    ...rows.filter(r => r.shareId).map(r => ({ path: sharedPath(r.game, r.shareId!), lastmod: new Date(r.updatedAt) })),
  ]
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return urlset(siteOrigin(useRuntimeConfig(event).public.siteUrl, getRequestURL(event).origin), urls)
})
