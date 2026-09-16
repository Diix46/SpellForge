import { cardPath } from '../../../shared/game'
import { useMtgCardsDb } from '../../utils/cards/db'
import { siteOrigin, urlset } from '../../utils/sitemap'

// Only the list is cached: a cached handler does not see the request's host,
// which the addresses need.
const cardPaths = defineCachedFunction(async () => {
  const { rows } = await useMtgCardsDb().execute(
    'SELECT name FROM oracle_cards WHERE legal_commander = 1 AND is_funny = 0 ORDER BY edhrec_rank IS NULL, edhrec_rank, name',
  )
  return rows.map(r => cardPath('mtg', String(r.name)))
}, { maxAge: 60 * 60 * 24, name: 'sitemap-mtg-paths', getKey: () => 'all' })

/**
 * Every Magic card the library shows: legal in Commander, no joke cards
 * (31 830 today, under the 50 000 a sitemap may hold).
 */
export default defineEventHandler(async (event) => {
  const paths = await cardPaths()
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return urlset(siteOrigin(useRuntimeConfig(event).public.siteUrl, getRequestURL(event).origin), paths.map(path => ({ path })))
})
