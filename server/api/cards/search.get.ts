// Proxies Scryfall card search (server-side: avoids CORS, sets a proper UA,
// and turns Scryfall's 404 "no cards found" into an empty result instead of an error).

const UA = 'Spellforge/0.1 (deckbuilder; contact: spellforge.app)'
const SCRYFALL = 'https://api.scryfall.com/cards/search'

interface SearchResult {
  total: number
  hasMore: boolean
  cards: unknown[]
}

export default defineEventHandler(async (event): Promise<SearchResult> => {
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
    throw createError({ statusCode: 502, statusMessage: `Scryfall ${res.status}` })
  }

  const data = await res.json() as { total_cards?: number, has_more?: boolean, data?: unknown[] }
  return {
    total: data.total_cards ?? 0,
    hasMore: data.has_more ?? false,
    cards: data.data ?? [],
  }
})
