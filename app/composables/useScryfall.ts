import type { DeckEntry } from './useDecklist'

export interface ScryfallCard {
  id: string
  oracle_id?: string
  name: string
  printed_name?: string
  lang: string
  set: string
  set_name: string
  collector_number: string
  rarity?: string
  scryfall_uri?: string
  type_line?: string
  printed_type_line?: string
  mana_cost?: string
  cmc?: number
  oracle_text?: string
  printed_text?: string
  colors?: string[]
  color_identity?: string[]
  keywords?: string[]
  prices?: {
    eur?: string | null
    eur_foil?: string | null
    usd?: string | null
  }
  image_uris?: {
    small: string
    normal: string
    large: string
    png: string
  }
  card_faces?: Array<{
    name: string
    printed_name?: string
    type_line?: string
    printed_type_line?: string
    mana_cost?: string
    oracle_text?: string
    printed_text?: string
    image_uris?: {
      small: string
      normal: string
      large: string
      png: string
    }
  }>
  layout: string
  // Scryfall image quality: 'missing' | 'placeholder' | 'lowres' | 'highres_scan'
  image_status?: string
}

export interface ResolvedCard {
  entry: DeckEntry
  card: ScryfallCard | null
  imageUrl: string | null
  backImageUrl: string | null
  lang: string
  // Best EUR price (FR printing first, else the default/EN printing — FR prints
  // are often priceless on Cardmarket, so we keep the default as a fallback).
  priceEur?: string | null
  error?: string
}

export interface FetchProgress {
  loaded: number
  total: number
}

const SCRYFALL_BASE = 'https://api.scryfall.com'
const BATCH_SIZE = 75
const DELAY_MS = 100

const DFC_LAYOUTS = ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card', 'art_series']

function isDoubleFaced(card: ScryfallCard): boolean {
  return DFC_LAYOUTS.includes(card.layout) && !!card.card_faces?.[1]?.image_uris
}

function frontImage(card: ScryfallCard, quality: 'normal' | 'large' | 'png' = 'large'): string | null {
  if (card.image_uris)
    return card.image_uris[quality] ?? card.image_uris.normal
  if (card.card_faces?.[0]?.image_uris) {
    return card.card_faces[0].image_uris[quality] ?? card.card_faces[0].image_uris.normal
  }
  return null
}

function backImage(card: ScryfallCard, quality: 'normal' | 'large' | 'png' = 'large'): string | null {
  if (card.card_faces?.[1]?.image_uris) {
    return card.card_faces[1].image_uris[quality] ?? card.card_faces[1].image_uris.normal
  }
  return null
}

// Simple per-session cache keyed by `${set}/${number}/${lang}` and by name.
const cardCache = new Map<string, ScryfallCard | null>()
const frByNameCache = new Map<string, ScryfallCard | null>()
// Names whose bulk FR lookup is currently in flight — prevents duplicate
// network requests when bulkPrefetchFrench runs concurrently for the same cards.
const frInFlight = new Set<string>()

const FR_CONCURRENCY = 8
// Names per bulk French search. Scryfall query strings are URL-length bound
// (~kB) and `!"name" or …` is verbose, so keep chunks modest.
const FR_BULK_CHUNK = 40

/** Map items through an async fn with bounded concurrency, preserving order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = Array.from({ length: items.length }) as R[]
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]!, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function hasImage(card: ScryfallCard | null): boolean {
  return !!card && (!!card.image_uris || !!card.card_faces?.[0]?.image_uris)
}

// A "real" image excludes Scryfall's "Localized Image Not Available" placeholders.
function hasRealImage(card: ScryfallCard | null): boolean {
  if (!hasImage(card))
    return false
  const status = card!.image_status
  return status !== 'placeholder' && status !== 'missing'
}

export function useScryfall() {
  // Try the exact printing in the requested language.
  async function fetchLocalized(
    set: string,
    collectorNumber: string,
    lang: string,
  ): Promise<ScryfallCard | null> {
    const key = `${set}/${collectorNumber}/${lang}`
    if (cardCache.has(key))
      return cardCache.get(key)!
    try {
      const res = await fetch(`${SCRYFALL_BASE}/cards/${set.toLowerCase()}/${collectorNumber}/${lang}`)
      const card = res.ok ? await res.json() : null
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
  // another printing of the same card usually does.
  async function searchFrenchByName(name: string): Promise<ScryfallCard | null> {
    const cacheName = name.toLowerCase()
    if (frByNameCache.has(cacheName))
      return frByNameCache.get(cacheName)!
    try {
      const q = `!"${name}" lang:fr`
      const url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(q)}&order=released&dir=desc&unique=prints`
      const res = await fetch(url)
      if (!res.ok) {
        frByNameCache.set(cacheName, null)
        return null
      }
      const data = await res.json()
      const target = name.toLowerCase()

      // Only printings that have an actual image (no "not available" placeholders),
      // and whose full name matches exactly (avoids split/adventure cards like
      // "Emeritus of Conflict // Lightning Bolt" matching "Lightning Bolt").
      const realImages: ScryfallCard[] = (data.data ?? [])
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
  async function bulkPrefetchFrench(names: string[]): Promise<void> {
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

  // Resolve the best French version of a matched card with a REAL image, or null
  // if no usable French printing exists (caller keeps the matched card).
  // When `pinned` is true the user chose a specific printing, so we ONLY try the
  // FR version of THAT exact printing — we never substitute a different FR art.
  async function resolveFrench(match: ScryfallCard, pinned = false): Promise<ScryfallCard | null> {
    if (match.lang === 'fr' && hasRealImage(match))
      return match
    if (pinned) {
      const exactPinned = await fetchLocalized(match.set, match.collector_number, 'fr')
      return hasRealImage(exactPinned) ? exactPinned : null
    }
    // 0. If the bulk pre-pass already found an FR printing by name, use it and
    //    skip the per-card exact-printing lookup (saves one request per card).
    const preCached = frByNameCache.get(match.name.toLowerCase())
    if (preCached && hasRealImage(preCached))
      return preCached
    // 1. exact printing in FR (only if it has a real image)
    const exact = await fetchLocalized(match.set, match.collector_number, 'fr')
    if (hasRealImage(exact))
      return exact
    // 2. any FR printing by name with a real image (cache may already hold a
    //    null from the bulk pass, in which case this is a no-op cache read).
    const byName = await searchFrenchByName(match.name)
    if (hasRealImage(byName))
      return byName
    return null
  }

  async function fetchCollection(
    entries: DeckEntry[],
    lang: 'en' | 'fr',
    onProgress?: (p: FetchProgress) => void,
  ): Promise<ResolvedCard[]> {
    const results: ResolvedCard[] = []
    let processed = 0

    // Process in batches of BATCH_SIZE using the /cards/collection endpoint.
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE)

      const identifiers = batch.map((entry) => {
        if (entry.set && entry.collectorNumber) {
          return { set: entry.set.toLowerCase(), collector_number: entry.collectorNumber }
        }
        return { name: entry.name }
      })

      let foundCards: ScryfallCard[] = []
      let requestError: string | null = null

      try {
        // Our cached Nitro proxy (SWR) — repeat deck opens are instant instead
        // of re-hitting Scryfall's slow collection endpoint every time.
        const data = await $fetch<{ data?: ScryfallCard[] }>('/api/cards/collection', {
          method: 'POST',
          body: { identifiers },
        })
        foundCards = data.data ?? []
      }
      catch (err) {
        requestError = err instanceof Error ? err.message : 'erreur réseau'
      }

      // FR mode: warm the by-name cache for the whole batch in one search per
      // ~40 names, so the per-card resolveFrench() fallback hits cache instead
      // of firing a /cards/search per card (the main N+1 latency source).
      if (lang === 'fr' && !requestError)
        await bulkPrefetchFrench(batch.map(e => e.name))

      // Resolve each entry of the batch concurrently (bounded pool). FR
      // resolution may still do the exact-printing lookup per card, but the
      // expensive by-name search is now pre-warmed. Results stay in batch order.
      const resolved = await mapPool(batch, FR_CONCURRENCY, async (entry): Promise<ResolvedCard> => {
        if (requestError) {
          return { entry, card: null, imageUrl: null, backImageUrl: null, lang, error: `Erreur réseau: ${requestError}` }
        }
        const match = findMatch(foundCards, entry)
        if (!match) {
          return { entry, card: null, imageUrl: null, backImageUrl: null, lang, error: `Carte introuvable: ${entry.name}` }
        }

        let finalCard = match
        let finalLang = match.lang
        // Try to get a French version of the card. A pinned printing (entry has
        // set+number) is honoured: only its own FR version is tried, never a
        // substitute art.
        if (lang === 'fr') {
          const isPinned = !!(entry.set && entry.collectorNumber)
          const fr = await resolveFrench(match, isPinned)
          if (fr) {
            finalCard = fr
            finalLang = 'fr'
          }
        }
        // Price: prefer the displayed card's EUR, else the default printing's EUR.
        const priceEur = finalCard.prices?.eur ?? match.prices?.eur ?? null
        return {
          entry,
          card: finalCard,
          imageUrl: frontImage(finalCard),
          backImageUrl: isDoubleFaced(finalCard) ? backImage(finalCard) : null,
          lang: finalLang,
          priceEur,
        }
      })

      results.push(...resolved)
      processed += batch.length
      onProgress?.({ loaded: processed, total: entries.length })

      if (i + BATCH_SIZE < entries.length) {
        await new Promise(r => setTimeout(r, DELAY_MS))
      }
    }

    return results
  }

  function findMatch(cards: ScryfallCard[], entry: DeckEntry): ScryfallCard | null {
    // Prefer exact set + collector number match.
    if (entry.set && entry.collectorNumber) {
      const exact = cards.find(
        c => c.set?.toLowerCase() === entry.set!.toLowerCase()
          && c.collector_number === entry.collectorNumber,
      )
      if (exact)
        return exact
    }
    // Otherwise match by name (case-insensitive, handle split/DFC "A // B").
    const target = entry.name.toLowerCase()
    return cards.find((c) => {
      const n = c.name.toLowerCase()
      return n === target || n.split(' // ')[0] === target
    }) ?? null
  }

  return { fetchCollection, isDoubleFaced }
}
