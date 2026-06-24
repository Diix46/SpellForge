import type { ScryfallCard } from './types'
import { hasRealImage } from './helpers'

// Simple per-session cache keyed by `${set}/${number}/${lang}` and by name.
// These are module-scoped SINGLETONS: imported by reference everywhere, never
// re-created per call, so caching survives across deck opens.
export const cardCache = new Map<string, ScryfallCard | null>()
export const frByNameCache = new Map<string, ScryfallCard | null>()
// Names whose bulk FR lookup is currently in flight — prevents duplicate
// network requests when bulkPrefetchFrench runs concurrently for the same cards.
export const frInFlight = new Set<string>()

// Names per bulk French search. Scryfall query strings are URL-length bound
// (~kB) and `!"name" or …` is verbose, so keep chunks modest.
const FR_BULK_CHUNK = 40

// Try the exact printing in the requested language. Goes through our cached
// Nitro route (/api/cards/localized) instead of hitting api.scryfall.com from
// the browser, so a given printing is fetched once and then served instantly
// (and the result is shared across users + survives server restarts).
export async function fetchLocalized(
  set: string,
  collectorNumber: string,
  lang: string,
): Promise<ScryfallCard | null> {
  // Lowercase set in the key so it matches the keys bulkPrefetchLocalized()
  // writes (both must agree or the pre-warm is wasted and we re-fetch per card).
  const key = `${set.toLowerCase()}/${collectorNumber}/${lang}`
  if (cardCache.has(key))
    return cardCache.get(key)!
  try {
    const data = await $fetch<{ card: ScryfallCard | null }>('/api/cards/localized', {
      params: { set: set.toLowerCase(), number: collectorNumber, lang },
    })
    const card = data.card ?? null
    cardCache.set(key, card)
    return card
  }
  catch {
    cardCache.set(key, null)
    return null
  }
}

// Fallback: search for ANY French printing of a card by exact name.
// Many printings (promos, Mystery Booster, etc.) have no FR version, but
// another printing of the same card usually does. Routed through the cached
// /api/cards/search proxy (same SWR cache the bulk pre-pass warms).
export async function searchFrenchByName(name: string): Promise<ScryfallCard | null> {
  const cacheName = name.toLowerCase()
  if (frByNameCache.has(cacheName))
    return frByNameCache.get(cacheName)!
  try {
    const q = `!"${name.replace(/"/g, '')}" lang:fr`
    const data = await $fetch<{ cards?: ScryfallCard[] }>('/api/cards/search', {
      params: { q, order: 'released', dir: 'desc', unique: 'prints' },
    })
    const target = name.toLowerCase()

    // Only printings that have an actual image (no "not available" placeholders),
    // and whose full name matches exactly (avoids split/adventure cards like
    // "Emeritus of Conflict // Lightning Bolt" matching "Lightning Bolt").
    const realImages: ScryfallCard[] = (data.cards ?? [])
      .filter((c: ScryfallCard) => hasRealImage(c) && c.name.toLowerCase() === target)

    // Prefer the highest-quality scan available.
    const highres = realImages.find(c => c.image_status === 'highres_scan')
    const card: ScryfallCard | null = highres ?? realImages[0] ?? null
    frByNameCache.set(cacheName, card)
    return card
  }
  catch {
    frByNameCache.set(cacheName, null)
    return null
  }
}

// Bulk-prefetch French printings for many names in ONE search per ~40 names,
// instead of one /cards/search per card. Pre-fills frByNameCache so the
// per-card resolveFrench() step 2 becomes a cache hit (or a cached null) and
// does no extra network. Same exact-name + real-image filtering as the
// single-name path, so correctness is identical — only the round-trip count
// drops from O(N) to O(N/40).
export async function bulkPrefetchFrench(names: string[]): Promise<void> {
  // Only names not already resolved AND not already being fetched by a
  // concurrent call (skip in-flight to avoid duplicate network requests).
  const pending = [...new Set(names.map(n => n.trim()).filter(Boolean))]
    .filter(n => !frByNameCache.has(n.toLowerCase()) && !frInFlight.has(n.toLowerCase()))
  if (!pending.length)
    return
  for (const n of pending) frInFlight.add(n.toLowerCase())

  try {
    await runBulkChunks(pending)
  }
  finally {
    for (const n of pending) frInFlight.delete(n.toLowerCase())
  }
}

async function runBulkChunks(pending: string[]): Promise<void> {
  for (let i = 0; i < pending.length; i += FR_BULK_CHUNK) {
    const chunk = pending.slice(i, i + FR_BULK_CHUNK)
    // Group the chunk's best FR printing by lowercased name.
    const byName = new Map<string, ScryfallCard>()
    try {
      const q = `(${chunk.map(n => `!"${n.replace(/"/g, '')}"`).join(' or ')}) lang:fr`
      // Cached Nitro search route (SWR) instead of a direct Scryfall hit — the
      // FR by-name pre-pass is now instant on repeat opens.
      const data = await $fetch<{ cards?: ScryfallCard[] }>('/api/cards/search', {
        params: { q, order: 'released', dir: 'desc', unique: 'prints' },
      })
      for (const c of (data.cards ?? []) as ScryfallCard[]) {
        if (!hasRealImage(c))
          continue
        const key = c.name.toLowerCase()
        const existing = byName.get(key)
        // Prefer the highest-quality scan, matching searchFrenchByName.
        if (!existing || (c.image_status === 'highres_scan' && existing.image_status !== 'highres_scan'))
          byName.set(key, c)
      }
    }
    catch {
      // Network error on the bulk query: leave these names unresolved so the
      // per-card path can retry individually (don't poison the cache).
      continue
    }
    // Record a result for every requested name — a hit, or a cached null so
    // resolveFrench() step 2 short-circuits without another request.
    for (const n of chunk) {
      const key = n.toLowerCase()
      if (!frByNameCache.has(key))
        frByNameCache.set(key, byName.get(key) ?? null)
    }
  }
}

// Bulk-prefetch the EXACT FR printing of many cards in ONE grouped search,
// pre-filling cardCache so resolveFrench()'s per-card fetchLocalized() step 1
// becomes a cache hit. This kills the localized N+1 (one ~400ms request per
// card on first open) — the whole batch now costs a single request.
export async function bulkPrefetchLocalized(
  printings: Array<{ set: string, number: string }>,
): Promise<void> {
  // Only printings not already in cardCache (skip what we already know).
  const items = printings
    .map(p => ({ set: p.set.toLowerCase(), number: p.number, lang: 'fr' }))
    .filter(p => p.set && p.number && !cardCache.has(`${p.set}/${p.number}/${p.lang}`))
  if (!items.length)
    return
  // De-dupe by key.
  const uniq = new Map<string, { set: string, number: string, lang: string }>()
  for (const it of items) uniq.set(`${it.set}/${it.number}/${it.lang}`, it)

  let map: Record<string, ScryfallCard> = {}
  try {
    const data = await $fetch<{ cards?: Record<string, ScryfallCard> }>('/api/cards/localized-batch', {
      method: 'POST',
      body: { items: [...uniq.values()] },
    })
    map = data.cards ?? {}
  }
  catch {
    // Batch failed: leave cardCache untouched so the per-card path retries.
    return
  }
  // Fill cardCache for every requested key — a hit, or a cached null so the
  // per-card fetchLocalized() short-circuits without another request.
  for (const key of uniq.keys())
    cardCache.set(key, map[key] ?? null)
}
