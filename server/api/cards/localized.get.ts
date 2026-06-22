// One exact printing in a specific language — Scryfall /cards/:set/:number/:lang.
// Used by FR resolution to fetch the French version of a known printing (and to
// honour a user-pinned printing). Proxied server-side so it's cached and shares
// a warm result across users; the client used to hit api.scryfall.com directly
// per card (uncached), which was the residual N+1 latency during FR resolve.
//
// Cached 24h per (set, number, lang): a given printing's data is stable.

export default defineCachedEventHandler(async (event): Promise<{ card: unknown | null }> => {
  const query = getQuery(event)
  const set = typeof query.set === 'string' ? query.set.trim().toLowerCase() : ''
  const number = typeof query.number === 'string' ? query.number.trim() : ''
  const lang = typeof query.lang === 'string' ? query.lang.trim().toLowerCase() : ''
  if (!set || !number || !lang)
    return { card: null }

  const url = `${SCRYFALL_CARDS}/${encodeURIComponent(set)}/${encodeURIComponent(number)}/${encodeURIComponent(lang)}`
  const res = await scryfallFetch(url)

  // A missing localized printing (no FR version of this exact card) is a normal,
  // cacheable answer — return null rather than throwing so we don't re-hit
  // Scryfall for it every time.
  if (res.status === 404)
    return { card: null }
  if (!res.ok) {
    // Transient failure: throw so the cache write is skipped (don't pin a hiccup).
    throw createError({ statusCode: 502, statusMessage: `Scryfall ${res.status}` })
  }

  return { card: await res.json() }
}, {
  maxAge: 60 * 60 * 24,
  staleMaxAge: 60 * 60 * 24,
  swr: true,
  name: 'scryfall-localized',
  getKey: (event) => {
    const q = getQuery(event)
    const set = typeof q.set === 'string' ? q.set.trim().toLowerCase() : ''
    const number = typeof q.number === 'string' ? q.number.trim() : ''
    const lang = typeof q.lang === 'string' ? q.lang.trim().toLowerCase() : ''
    return `${set}/${number}/${lang}`
  },
})
