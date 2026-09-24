import type { ResolvedRow } from './scryfall/toResolved'
import type { FetchProgress, ResolvedCard } from './scryfall/types'
import type { DeckEntry } from './useDecklist'
import { isDoubleFaced } from './scryfall/helpers'
import { toResolved } from './scryfall/toResolved'

// Re-export the public surface so consumers can keep importing everything from
// '~/composables/useScryfall' unchanged: types, image helpers, the game-neutral
// card model and its Magic adapters, and useScryfall() itself.
export type { GameCard } from '../types/cards'
export { getImageUris, isDoubleFaced } from './scryfall/helpers'
export { mtgRaw, toMtgCard } from './scryfall/toGameCard'
export type { FetchProgress, ImageUris, ResolvedCard, ScryfallCard } from './scryfall/types'

// The server resolves a whole Commander deck, sideboard included, in one call.
const RESOLVE_BATCH = 250

export function useScryfall() {
  const { t } = useLocale()

  /**
   * Resolve deck entries to displayable cards.
   *
   * This used to be a cascade run in the browser for every card: a collection
   * lookup that ignored language, then an exact localised lookup, a by-name
   * French search and a high-resolution upgrade — up to five network calls per
   * card, most of them to Scryfall. The server now answers for the whole deck
   * from the local card database, in one request.
   *
   * Signature and callbacks are unchanged, so callers need not know.
   */
  async function fetchCollection(
    entries: DeckEntry[],
    lang: 'en' | 'fr',
    onProgress?: (p: FetchProgress) => void,
    onPartial?: (cards: ResolvedCard[]) => void,
  ): Promise<ResolvedCard[]> {
    const results: ResolvedCard[] = []

    for (let i = 0; i < entries.length; i += RESOLVE_BATCH) {
      const batch = entries.slice(i, i + RESOLVE_BATCH)
      let rows: ResolvedRow[]
      try {
        const res = await $fetch<{ cards: ResolvedRow[] }>('/api/cards/resolve', {
          method: 'POST',
          body: {
            entries: batch.map(e => ({ name: e.name, set: e.set ?? null, collectorNumber: e.collectorNumber ?? null, lang: e.lang ?? null })),
            lang,
          },
        })
        rows = res.cards
      }
      catch {
        batch.forEach(entry => results.push({ ...toResolved(entry, undefined, lang), error: t('toast.loadError'), transient: true }))
        onProgress?.({ loaded: results.length, total: entries.length })
        continue
      }

      batch.forEach((entry, k) => results.push(toResolved(entry, rows[k], lang)))
      onProgress?.({ loaded: results.length, total: entries.length })
      // Stream intermediate state only when more batches follow; the final set
      // is emitted exactly once below, as it always was.
      if (i + RESOLVE_BATCH < entries.length)
        onPartial?.([...results])
    }

    onPartial?.(results)
    return results
  }

  return { fetchCollection, isDoubleFaced }
}
