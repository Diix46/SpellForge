// Proxies Scryfall card search (server-side: avoids CORS, sets a proper UA,
// and turns Scryfall's 404 "no cards found" into an empty result instead of an error).
//
// Cached (defineCachedEventHandler): identical searches are served from Nitro's
// cache instead of re-hitting Scryfall — this both speeds up pagination/repeat
// searches and keeps us under Scryfall's ~10 req/s soft limit. The cache key
// includes q/order/dir/page; the site locale lives INSIDE q (lang:fr / lang:en),
// so FR and EN results never collide. maxAge is short (60s) so the card pool
// stays fresh while a burst of identical requests is coalesced.

const UA = 'Spellforge/0.1 (deckbuilder; contact: spellforge.app)'
const SCRYFALL = 'https://api.scryfall.com/cards/search'

interface SearchResult {
  total: number
  hasMore: boolean
  cards: unknown[]
}

export default defineCachedEventHandler(async (event): Promise<SearchResult> => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const page = typeof query.page === 'string' ? Math.max(1, Number.parseInt(query.page) || 1) : 1
  const order = typeof query.order === 'string' ? query.order : 'edhrec'
  const dir = typeof query.dir === 'string' ? query.dir : 'auto'

  if (!q) {
    return { total: 0, hasMore: false, cards: [] }
  }

  const url = `${SCRYFALL}?q=${encodeURIComponent(q)}&order=${encodeURIComponent(order)}&dir=${encodeURIComponent(dir)}&page=${page}&unique=cards`

  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })

  // Scryfall returns 404 when a valid query simply matches nothing.
  if (res.status === 404) {
    return { total: 0, hasMore: false, cards: [] }
  }
  if (!res.ok) {
    // Don't cache failures — throwing skips the cache write so a transient
    // Scryfall hiccup isn't pinned for the whole maxAge window.
    throw createError({ statusCode: 502, statusMessage: `Scryfall ${res.status}` })
  }

  const data = await res.json() as { total_cards?: number, has_more?: boolean, data?: unknown[] }
  return {
    total: data.total_cards ?? 0,
    hasMore: data.has_more ?? false,
    cards: data.data ?? [],
  }
}, {
  maxAge: 60,
  name: 'scryfall-search',
  getKey: (event) => {
    const q = getQuery(event)
    const text = typeof q.q === 'string' ? q.q.trim() : ''
    const page = typeof q.page === 'string' ? Math.max(1, Number.parseInt(q.page) || 1) : 1
    const order = typeof q.order === 'string' ? q.order : 'edhrec'
    const dir = typeof q.dir === 'string' ? q.dir : 'auto'
    return `${order}:${dir}:${page}:${text}`
  },
})
