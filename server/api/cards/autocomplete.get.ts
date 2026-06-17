// Proxies Scryfall's card-name autocomplete (for quick-add by name).

const UA = 'Spellforge/0.1 (deckbuilder; contact: spellforge.app)'
const SCRYFALL = 'https://api.scryfall.com/cards/autocomplete'

export default defineEventHandler(async (event): Promise<{ names: string[] }> => {
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
})
