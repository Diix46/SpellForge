import type { FetchProgress, ResolvedCard, ScryfallCard } from './scryfall/types'
import type { DeckEntry } from './useDecklist'
import {
  bulkPrefetchFrench,
  bulkPrefetchLocalized,
  fetchLocalized,
  frByNameCache,
  searchFrenchByName,
} from './scryfall/cache'
import {
  backImage,
  findMatch,
  frontImage,
  hasRealImage,
  isDoubleFaced,
  mapPool,
  quickResolved,
} from './scryfall/helpers'

// Re-export the public surface so consumers can keep importing everything from
// '~/composables/useScryfall' unchanged (types + getImageUris + useScryfall()).
export { getImageUris, isDoubleFaced } from './scryfall/helpers'
export type { FetchProgress, ImageUris, ResolvedCard, ScryfallCard } from './scryfall/types'

const BATCH_SIZE = 75
const DELAY_MS = 100

const FR_CONCURRENCY = 8

export function useScryfall() {
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

  // ---- fetchCollection phases (one batch at a time) -----------------------
  // Split out of fetchCollection so each phase is a named, testable unit; they
  // close over the same caches/helpers so behaviour is identical to the inline
  // version. fetchCollection just orchestrates: fetch → paint → prewarm → resolve.

  /** Look up one batch via the cached /cards/collection proxy. */
  async function fetchBatch(batch: DeckEntry[]): Promise<{ foundCards: ScryfallCard[], requestError: string | null }> {
    const identifiers = batch.map((entry) => {
      if (entry.set && entry.collectorNumber)
        return { set: entry.set.toLowerCase(), collector_number: entry.collectorNumber }
      return { name: entry.name }
    })
    try {
      // Our cached Nitro proxy (SWR) — repeat deck opens are instant instead of
      // re-hitting Scryfall's slow collection endpoint every time.
      const data = await $fetch<{ data?: ScryfallCard[] }>('/api/cards/collection', {
        method: 'POST',
        body: { identifiers },
      })
      return { foundCards: data.data ?? [], requestError: null }
    }
    catch (err) {
      return { foundCards: [], requestError: err instanceof Error ? err.message : 'erreur réseau' }
    }
  }

  /**
   * FR mode: warm the by-name cache (one search per ~40 names) AND the exact-FR-
   * printing cache (one grouped request), so the per-card resolveFrench() below
   * hits cache instead of firing a /cards/search + fetchLocalized per card (the
   * two N+1 latency sources). Mirrors resolveFrench()'s control flow exactly so
   * the prewarm set matches what resolveFrench would actually look up:
   *   - pinned (entry has set+number): always goes straight to fetchLocalized →
   *     always pre-warm it.
   *   - non-pinned: tries the by-name cache first, only falling to fetchLocalized
   *     if that missed → pre-warm only those.
   */
  async function prewarmFrench(batch: DeckEntry[], foundCards: ScryfallCard[]): Promise<void> {
    await bulkPrefetchFrench(batch.map(e => e.name))

    const needLocalized: Array<{ set: string, number: string }> = []
    for (const entry of batch) {
      const match = findMatch(foundCards, entry)
      if (!match || !match.set || !match.collector_number)
        continue
      if (match.lang === 'fr' && hasRealImage(match))
        continue // already FR with image — no lookup needed
      const isPinned = !!(entry.set && entry.collectorNumber)
      if (!isPinned) {
        const byName = frByNameCache.get(match.name.toLowerCase())
        if (byName && hasRealImage(byName))
          continue // by-name pass covered it — resolveFrench uses that
      }
      needLocalized.push({ set: match.set, number: match.collector_number })
    }
    await bulkPrefetchLocalized(needLocalized)
  }

  /**
   * Resolve a batch to final ResolvedCards (bounded concurrency, batch order).
   * For FR, each card may still do its exact-printing lookup, but both caches
   * are pre-warmed by prewarmFrench so those resolve instantly.
   */
  function resolveBatch(batch: DeckEntry[], foundCards: ScryfallCard[], requestError: string | null, lang: 'en' | 'fr'): Promise<ResolvedCard[]> {
    return mapPool(batch, FR_CONCURRENCY, async (entry): Promise<ResolvedCard> => {
      if (requestError)
        return { entry, card: null, imageUrl: null, backImageUrl: null, lang, error: `Erreur réseau: ${requestError}` }
      const match = findMatch(foundCards, entry)
      if (!match)
        return { entry, card: null, imageUrl: null, backImageUrl: null, lang, error: `Carte introuvable: ${entry.name}` }

      let finalCard = match
      let finalLang = match.lang
      // Try to get a French version. A pinned printing (entry has set+number) is
      // honoured: only its own FR version is tried, never a substitute art.
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
  }

  async function fetchCollection(
    entries: DeckEntry[],
    lang: 'en' | 'fr',
    onProgress?: (p: FetchProgress) => void,
    // Fires with a fast, default-image resolution per batch BEFORE the (slower)
    // FR art enrichment, so the UI can show thumbnails immediately.
    onPartial?: (cards: ResolvedCard[]) => void,
  ): Promise<ResolvedCard[]> {
    const results: ResolvedCard[] = []
    // Cumulative instant-paint set, grown one batch at a time. The consumer
    // REPLACES its list with each emission (resolvedCards = preliminary), so we
    // must emit the full set-so-far, not just the current batch — otherwise
    // earlier batches would vanish from the grid between emissions.
    const partial: ResolvedCard[] = []
    let processed = 0

    // Process in batches of BATCH_SIZE using the /cards/collection endpoint.
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE)
      const { foundCards, requestError } = await fetchBatch(batch)

      // Instant first paint: emit this batch resolved to its default (usually EN)
      // printing right away, so deck-list thumbnails appear without waiting for
      // the slower FR art resolution below. The final return upgrades to FR.
      if (onPartial && !requestError) {
        for (const entry of batch)
          partial.push(quickResolved(entry, findMatch(foundCards, entry), lang))
        onPartial([...partial])
      }

      if (lang === 'fr' && !requestError)
        await prewarmFrench(batch, foundCards)

      results.push(...await resolveBatch(batch, foundCards, requestError, lang))
      processed += batch.length
      onProgress?.({ loaded: processed, total: entries.length })

      if (i + BATCH_SIZE < entries.length)
        await new Promise(r => setTimeout(r, DELAY_MS))
    }

    return results
  }

  return { fetchCollection, isDoubleFaced }
}
