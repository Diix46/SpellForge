import { cardPath } from '../../../shared/game'
import { useOptcgCardsDb } from '../../utils/cards/db'
import { siteOrigin, urlset } from '../../utils/sitemap'

// Only the list is cached: a cached handler does not see the request's host,
// which the addresses need.
const cardPaths = defineCachedFunction(async () => {
  const { rows } = await useOptcgCardsDb().execute('SELECT card_number FROM op_numbers ORDER BY card_number')
  return rows.map(r => cardPath('optcg', String(r.card_number)))
}, { maxAge: 60 * 60 * 24, name: 'sitemap-optcg-paths', getKey: () => 'all' })

/** Every One Piece card number. The catalogue moves with each ingestion. */
export default defineEventHandler(async (event) => {
  const paths = await cardPaths()
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return urlset(siteOrigin(useRuntimeConfig(event).public.siteUrl, getRequestURL(event).origin), paths.map(path => ({ path })))
})
