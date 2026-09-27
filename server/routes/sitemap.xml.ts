import { GAME_LIST } from '../../shared/game'
import { sitemapIndex, siteOrigin } from '../utils/sitemap'

/** The index: public pages and shared decks, then each game's cards. */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  const origin = siteOrigin(useRuntimeConfig(event).public.siteUrl, getRequestURL(event).origin)
  return sitemapIndex(origin, ['/sitemaps/pages.xml', ...GAME_LIST.map(g => `/sitemaps/${g.slug}.xml`)])
})
