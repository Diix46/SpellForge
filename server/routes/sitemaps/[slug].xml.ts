import type { TcgGameId } from '../../../shared/tcg/types'
import { cardPath, gameFromSlug } from '../../../shared/game'
import { isTcgGame } from '../../../shared/tcg/types'
import { siteOrigin, urlset } from '../../utils/sitemap'
import { useTcgDb } from '../../utils/tcg/db'

// Only the list is cached: a cached handler does not see the request's host,
// which the addresses need.
const cardPaths = defineCachedFunction(async (game: TcgGameId) => {
  const { rows } = await useTcgDb(game).execute('SELECT DISTINCT id FROM cards ORDER BY id')
  return rows.map(r => cardPath(game, String(r.id)))
}, { maxAge: 60 * 60 * 24, name: 'sitemap-tcg-paths', getKey: (game: TcgGameId) => game })

/**
 * Every printing of a generic-engine game (/sitemaps/pokemon.xml). Magic and
 * One Piece have their own files, which take their addresses first.
 */
export default defineEventHandler(async (event) => {
  // Read from the path: the router names this parameter with its extension.
  const game = gameFromSlug(/\/sitemaps\/([^/]+)\.xml$/.exec(getRequestURL(event).pathname)?.[1])
  if (!isTcgGame(game))
    throw createError({ statusCode: 404 })
  const paths = await cardPaths(game)
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return urlset(siteOrigin(useRuntimeConfig(event).public.siteUrl, getRequestURL(event).origin), paths.map(path => ({ path })))
})
