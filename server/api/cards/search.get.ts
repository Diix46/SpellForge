// Proxies Scryfall card search (server-side: avoids CORS, sets a proper UA,
// and turns Scryfall's 404 "no cards found" into an empty result instead of an error).
//
// Cached (defineCachedEventHandler): identical searches are served from Nitro's
// cache instead of re-hitting Scryfall — this both speeds up pagination/repeat
// searches and keeps us under Scryfall's ~10 req/s soft limit. The cache key
// includes q/order/dir/page; the site locale lives INSIDE q (lang:fr / lang:en),
// so FR and EN results never collide. maxAge is short (60s) so the card pool
// stays fresh while a burst of identical requests is coalesced.

interface ScryCard {
  name?: string
  lang?: string
  prices?: { eur?: string | null }
}

interface SearchResult {
  total: number
  hasMore: boolean
  cards: unknown[]
}

/**
 * FR printings almost never carry an EUR price on Scryfall, but the Cardmarket
 * price is language-agnostic. So for a French result set, look up the EUR price
 * of each card's default (usually English) printing via /cards/collection and
 * patch it onto the FR cards. One extra request per ~75 missing-price cards.
 */
async function enrichFrenchPrices(cards: ScryCard[]): Promise<void> {
  const missing = cards.filter(c => c.name && !c.prices?.eur)
  if (!missing.length)
    return
  // Resolve the default (usually EN) printing of each missing-price card and
  // patch its EUR price onto the FR card (shared chunk-by-75 collection loop).
  const byName = await resolveScryfallByName<ScryCard>(missing.map(c => c.name!))
  for (const c of missing) {
    const eur = byName.get((c.name ?? '').toLowerCase())?.prices?.eur
    if (eur)
      c.prices = { ...(c.prices ?? {}), eur }
  }
}

export default defineCachedEventHandler(async (event): Promise<SearchResult> => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const page = typeof query.page === 'string' ? Math.max(1, Number.parseInt(query.page) || 1) : 1
  const order = typeof query.order === 'string' ? query.order : 'edhrec'
  const dir = typeof query.dir === 'string' ? query.dir : 'auto'
  // `unique` defaults to 'cards' (de-duped pool for browsing); callers resolving
  // a specific FR printing pass unique=prints. Whitelisted to keep the cache key safe.
  const unique = query.unique === 'prints' ? 'prints' : 'cards'

  if (!q) {
    return { total: 0, hasMore: false, cards: [] }
  }

  const url = `${SCRYFALL_SEARCH}?q=${encodeURIComponent(q)}&order=${encodeURIComponent(order)}&dir=${encodeURIComponent(dir)}&page=${page}&unique=${unique}`

  const res = await scryfallFetch(url)

  // Scryfall returns 404 when a valid query simply matches nothing.
  if (res.status === 404) {
    return { total: 0, hasMore: false, cards: [] }
  }
  if (!res.ok) {
    // Don't cache failures — throwing skips the cache write so a transient
    // Scryfall hiccup isn't pinned for the whole maxAge window.
    throw createError({ statusCode: 502, statusMessage: `Scryfall ${res.status}` })
  }

  const data = await res.json() as { total_cards?: number, has_more?: boolean, data?: ScryCard[] }
  const cards = data.data ?? []

  // French results: backfill missing EUR prices from the default printing.
  if (/\blang:fr\b/.test(q))
    await enrichFrenchPrices(cards)

  return {
    total: data.total_cards ?? 0,
    hasMore: data.has_more ?? false,
    cards,
  }
}, {
  maxAge: 60,
  // Stale-while-revalidate: after maxAge a stale result is served INSTANTLY
  // while a fresh one is fetched in the background. Scryfall full-text queries
  // can take seconds when cold on their side; SWR means a user only ever eats
  // that latency once per query, then it's always instant for ~24h.
  staleMaxAge: 60 * 60 * 24,
  swr: true,
  name: 'scryfall-search',
  getKey: (event) => {
    const q = getQuery(event)
    const text = typeof q.q === 'string' ? q.q.trim() : ''
    const page = typeof q.page === 'string' ? Math.max(1, Number.parseInt(q.page) || 1) : 1
    const order = typeof q.order === 'string' ? q.order : 'edhrec'
    const dir = typeof q.dir === 'string' ? q.dir : 'auto'
    const unique = q.unique === 'prints' ? 'prints' : 'cards'
    return `${order}:${dir}:${unique}:${page}:${text}`
  },
})
