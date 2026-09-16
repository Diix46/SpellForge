import type { FetchProgress, ResolvedCard, ScryfallCard } from './scryfall/types'
import type { DeckEntry } from './useDecklist'
import {
  bulkPrefetchFrench,
  bulkPrefetchLocalized,
  fetchLocalized,
  frByNameCache,
  searchBestPrinting,
  searchFrenchByName,
} from './scryfall/cache'
import {
  backImage,
  findMatch,
  frontImage,
  hasRealImage,
  isDoubleFaced,
  mapPool,
} from './scryfall/helpers'
import { toMtgCard } from './scryfall/toGameCard'

// Re-export the public surface so consumers can keep importing everything from
// '~/composables/useScryfall' unchanged: types, image helpers, the game-neutral
// card model and its Magic adapters, and useScryfall() itself.
export type { GameCard } from '../types/cards'
export { getImageUris, isDoubleFaced } from './scryfall/helpers'
export { mtgRaw, toMtgCard } from './scryfall/toGameCard'
export type { FetchProgress, ImageUris, ResolvedCard, ScryfallCard } from './scryfall/types'

const BATCH_SIZE = 75
const DELAY_MS = 100

const FR_CONCURRENCY = 8

export function useScryfall() {
  const { t } = useLocale()
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
    // 1. exact printing in FR — only settle for it immediately if it's a highres
    //    scan; a real-but-lowres exact printing used to short-circuit here and
    //    skip the highres-preferring by-name search below entirely.
    const exact = await fetchLocalized(match.set, match.collector_number, 'fr')
    if (exact && hasRealImage(exact) && exact.image_status === 'highres_scan')
      return exact
    // 2. any FR printing by name, preferring a highres scan (cache may already
    //    hold a null from the bulk pass, in which case this is a no-op read).
    const byName = await searchFrenchByName(match.name)
    if (hasRealImage(byName))
      return byName
    // No better FR printing found by name — fall back to the exact one if it
    // at least has a real (if lower-res) image.
    if (hasRealImage(exact))
      return exact
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
      return { foundCards: [], requestError: err instanceof Error ? err.message : t('toast.loadError') }
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
   * Resolve a batch to final ResolvedCards (bounded concurrency, arrival order
   * via `onCard`, input order in the returned array). For FR, each card may
   * still do its exact-printing lookup, but both caches are pre-warmed by
   * prewarmFrench so those resolve instantly (cache hits, no network).
   */
  function resolveBatch(batch: DeckEntry[], foundCards: ScryfallCard[], requestError: string | null, lang: 'en' | 'fr', onCard?: (card: ResolvedCard, i: number) => void): Promise<ResolvedCard[]> {
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
      // Upgrade to a highres scan if we ended up on a lowres one — covers the
      // EN default match (the /cards/collection endpoint can hand back an old
      // scan) and the FR-unavailable fallback. The FR path above already
      // applies its own highres preference via resolveFrench, so skip it there.
      if (finalLang !== 'fr' && finalCard.image_status !== 'highres_scan') {
        const better = await searchBestPrinting(finalCard.name, finalLang)
        if (better)
          finalCard = better
      }
      // Price: prefer the displayed card's EUR, else the default printing's EUR.
      const priceEur = finalCard.prices?.eur ?? match.prices?.eur ?? null
      return {
        entry,
        card: toMtgCard(finalCard),
        imageUrl: frontImage(finalCard),
        backImageUrl: isDoubleFaced(finalCard) ? backImage(finalCard) : null,
        lang: finalLang,
        priceEur,
      }
    }, onCard)
  }

  async function fetchCollection(
    entries: DeckEntry[],
    lang: 'en' | 'fr',
    onProgress?: (p: FetchProgress) => void,
    // Streams cards as they finish resolving — in their FINAL language, never a
    // placeholder in the wrong one — so the deck list fills in progressively
    // instead of sitting frozen until the whole batch settles. Cards resolve
    // fast once prewarmFrench has warmed the caches (mostly cache hits), so
    // this restores the "instant" feel the old EN-then-FR pre-paint gave
    // without ever showing a card in the wrong language.
    onPartial?: (cards: ResolvedCard[]) => void,
  ): Promise<ResolvedCard[]> {
    const results: ResolvedCard[] = []
    let processed = 0

    // Cards can resolve within milliseconds of each other once caches are
    // warm — emitting on every single one causes visible render jank, and
    // mapPool's concurrency means they settle out of input order. Keep the
    // in-flight batch's resolved-so-far cards in their original slots (so the
    // emitted list never reorders) and throttle emissions to ~1 per 120ms.
    let currentBatchSlots: (ResolvedCard | undefined)[] = []
    let emitTimer: ReturnType<typeof setTimeout> | null = null
    function scheduleEmit() {
      if (!onPartial || emitTimer)
        return
      emitTimer = setTimeout(() => {
        emitTimer = null
        onPartial!([...results, ...currentBatchSlots.filter((c): c is ResolvedCard => !!c)])
      }, 120)
    }

    // Process in batches of BATCH_SIZE using the /cards/collection endpoint.
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE)
      const { foundCards, requestError } = await fetchBatch(batch)

      if (lang === 'fr' && !requestError)
        await prewarmFrench(batch, foundCards)

      currentBatchSlots = Array.from({ length: batch.length })
      results.push(...await resolveBatch(batch, foundCards, requestError, lang, (card, idx) => {
        currentBatchSlots[idx] = card
        scheduleEmit()
      }))
      currentBatchSlots = []
      processed += batch.length
      onProgress?.({ loaded: processed, total: entries.length })

      if (i + BATCH_SIZE < entries.length)
        await new Promise(r => setTimeout(r, DELAY_MS))
    }

    // Flush any cards still waiting on the throttle timer, and always emit the
    // fully-resolved final set once — belt-and-suspenders in case the caller
    // only reads onPartial (loadCards() also assigns the return value itself).
    if (emitTimer) {
      clearTimeout(emitTimer)
      emitTimer = null
    }
    onPartial?.(results)

    return results
  }

  return { fetchCollection, isDoubleFaced }
}
