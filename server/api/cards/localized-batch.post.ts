// Resolve MANY exact printings in a chosen language in as few Scryfall calls as
// possible. The per-card /api/cards/localized route is fine on a warm cache, but
// the FIRST open of a deck fires one request per card the bulk-by-name pass
// missed (each a ~300-600ms cold Scryfall hit) — a classic N+1.
//
// Scryfall's /cards/collection can't do this: it ignores language and always
// returns the default (usually EN) printing. But ONE /cards/search with a
// grouped query — `(set:a cn:1 or set:b cn:2 ...) lang:fr` — returns every exact
// FR printing in a single round trip. So N localized calls collapse to ~1.
//
// Returns a map keyed `set/number/lang` so the client can fill its per-printing
// cache directly. Cached 24h (a printing's data is stable); a printing the
// search didn't return is simply absent from the map (caller falls back).

import { createHash } from 'node:crypto'

const UA = 'Spellforge/0.1 (deckbuilder; contact: spellforge.app)'
const SCRYFALL_SEARCH = 'https://api.scryfall.com/cards/search'
// Scryfall query strings are URL-length bound and each `(set:x cn:y)` term is
// verbose, so resolve in modest chunks (one request each).
const CHUNK = 60
// Hard cap so a malformed/huge body can't fan out unboundedly.
const MAX_ITEMS = 300

interface Item { set?: string, number?: string, lang?: string }
interface ScryCard { set?: string, collector_number?: string, lang?: string }

function normalize(items: Item[]): Array<{ set: string, number: string, lang: string }> {
  const seen = new Set<string>()
  const out: Array<{ set: string, number: string, lang: string }> = []
  for (const it of items) {
    const set = (it.set ?? '').trim().toLowerCase()
    const number = (it.number ?? '').trim()
    const lang = (it.lang ?? '').trim().toLowerCase()
    if (!set || !number || !lang)
      continue
    const key = `${set}/${number}/${lang}`
    if (seen.has(key))
      continue
    seen.add(key)
    out.push({ set, number, lang })
  }
  return out.slice(0, MAX_ITEMS)
}

// Order-independent cache key for the requested (set, number, lang) set.
function keyFor(items: Array<{ set: string, number: string, lang: string }>): string {
  const norm = items.map(i => `${i.set}/${i.number}/${i.lang}`).sort().join('|')
  return createHash('sha1').update(norm).digest('hex')
}

async function fetchChunk(
  group: Array<{ set: string, number: string }>,
  lang: string,
  out: Record<string, ScryCard>,
): Promise<void> {
  // `(set:a cn:1 or set:b cn:2 ...) lang:LL`, unique=prints so each printing is distinct.
  const terms = group.map(g => `(set:${g.set} cn:${g.number})`).join(' or ')
  const q = `(${terms}) lang:${lang}`
  const url = `${SCRYFALL_SEARCH}?q=${encodeURIComponent(q)}&unique=prints&order=set`
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
  // 404 = none of this chunk has a printing in that language: a valid empty answer.
  if (res.status === 404)
    return
  if (!res.ok)
    throw createError({ statusCode: 502, statusMessage: `Scryfall ${res.status}` })
  const data = await res.json() as { data?: ScryCard[] }
  for (const c of data.data ?? []) {
    if (c.set && c.collector_number && c.lang)
      out[`${c.set.toLowerCase()}/${c.collector_number}/${c.lang.toLowerCase()}`] = c
  }
}

export default defineCachedEventHandler(async (event): Promise<{ cards: Record<string, ScryCard> }> => {
  const body = await readBody<{ items?: Item[] }>(event)
  const items = normalize(Array.isArray(body?.items) ? body.items : [])
  if (!items.length)
    return { cards: {} }

  // Group by language (each search is single-language), then chunk each group.
  const byLang = new Map<string, Array<{ set: string, number: string }>>()
  for (const it of items) {
    const arr = byLang.get(it.lang) ?? []
    arr.push({ set: it.set, number: it.number })
    byLang.set(it.lang, arr)
  }

  const cards: Record<string, ScryCard> = {}
  for (const [lang, group] of byLang) {
    for (let i = 0; i < group.length; i += CHUNK)
      await fetchChunk(group.slice(i, i + CHUNK), lang, cards)
  }
  return { cards }
}, {
  maxAge: 60 * 60 * 24,
  staleMaxAge: 60 * 60 * 24,
  swr: true,
  name: 'scryfall-localized-batch',
  getKey: async (event) => {
    const body = await readBody<{ items?: Item[] }>(event).catch(() => null)
    return keyFor(normalize(Array.isArray(body?.items) ? body!.items! : []))
  },
})
