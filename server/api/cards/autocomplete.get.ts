// Proxies Scryfall's card-name autocomplete (for quick-add by name).
//
// Cached: card names are stable, and the same prefixes are typed constantly,
// so a 1h cache eliminates most autocomplete round-trips. Key is the (trimmed)
// prefix; names are language-agnostic so no locale dimension is needed.

const UA = 'Spellforge/0.1 (deckbuilder; contact: spellforge.app)'
const SCRYFALL = 'https://api.scryfall.com/cards/autocomplete'

export default defineCachedEventHandler(async (event): Promise<{ names: string[] }> => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  if (q.length < 2) {
    return { names: [] }
  }

  const url = `${SCRYFALL}?q=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
  if (!res.ok) {
    throw createError({ statusCode: 502, statusMessage: `Scryfall ${res.status}` })
  }

  const data = await res.json() as { data?: string[] }
  return { names: data.data ?? [] }
}, {
  maxAge: 3600,
  name: 'scryfall-autocomplete',
  getKey: (event) => {
    const q = getQuery(event)
    return (typeof q.q === 'string' ? q.q.trim() : '').toLowerCase()
  },
})
