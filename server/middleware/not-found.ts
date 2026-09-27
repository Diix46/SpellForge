import { GAME_LIST } from '../../shared/game'

// Most pages are rendered in the browser (routeRules '/**': ssr false): the
// server sends the same shell for any address, with a 200, and the 404 page
// only appears once the app runs. An address whose first segment is no page
// of the site gets its 404 from the server too (search engines, link checkers).
const PAGES = new Set(['', 'decks', 'deck', 'discover', 'account', 'admin', 'joueur', 'shared', 'landing', ...GAME_LIST.map(g => g.slug)])
// Not pages: the server's routes, the build's files, public files.
const OTHER = /^\/(?:api|_nuxt|__nuxt|_ipx|_fonts|fonts|textures|icons|favicon|robots|sitemap|manifest|sw\.js|offline\.html)/

export default defineEventHandler((event) => {
  if (event.method !== 'GET' || OTHER.test(event.path) || /\.\w{2,5}$/.test(event.path.split('?')[0]!))
    return
  const first = event.path.split('?')[0]!.split('/')[1] ?? ''
  if (!PAGES.has(decodeURIComponent(first)))
    setResponseStatus(event, 404)
})
