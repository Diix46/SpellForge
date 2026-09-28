import { GAME_LIST } from '../../shared/game'

// Most pages are rendered in the browser (routeRules '/**': ssr false): the
// server sends the same shell for any address, with a 200, and the 404 page
// only appears once the app runs. An address whose first segment is no page
// of the site gets its 404 from the server too (search engines, link checkers).
const PAGES = new Set(['', 'decks', 'deck', 'discover', 'account', 'admin', 'joueur', 'shared', 'landing', ...GAME_LIST.map(g => g.slug)])
const GAMES = new Set(GAME_LIST.map(g => g.slug))
// Under a game's address, what exists: /magic, /magic/card/…, /magic/deck/…,
// /magic/shared/…, /magic/collection (and its tabs).
const GAME_PAGES = new Set(['card', 'deck', 'shared', 'collection'])
// Not pages: the server's routes, the build's files, public files.
const OTHER = /^\/(?:api|_nuxt|__nuxt|_ipx|_fonts|fonts|textures|icons|favicon|robots|sitemap|manifest|sw\.js|offline\.html)/

export default defineEventHandler((event) => {
  if (event.method !== 'GET' || OTHER.test(event.path) || /\.\w{2,5}$/.test(event.path.split('?')[0]!))
    return
  const [, first = '', second] = event.path.split('?')[0]!.split('/').map(decodeURIComponent)
  if (!PAGES.has(first) || (GAMES.has(first) && second && !GAME_PAGES.has(second)))
    setResponseStatus(event, 404)
})
