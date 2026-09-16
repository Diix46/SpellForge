import { useDb } from '../../utils/db'
import { SITEMAP_MAX_URLS, siteOrigin, urlset } from '../../utils/sitemap'
import { listedDeckUrls } from '../../utils/sitemap-decks'

const STATIC_PAGES = ['/', '/one-piece', '/magic', '/discover']

/** The public pages, and the decks their owners listed in Discover. */
export default defineEventHandler(async (event) => {
  const urls = [
    ...STATIC_PAGES.map(path => ({ path })),
    ...await listedDeckUrls(useDb(), SITEMAP_MAX_URLS - STATIC_PAGES.length),
  ]
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return urlset(siteOrigin(useRuntimeConfig(event).public.siteUrl, getRequestURL(event).origin), urls)
})
