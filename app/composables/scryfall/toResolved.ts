import type { DeckEntry } from '../useDecklist'
import type { ResolvedCard, ScryfallCard } from './types'
import { backImage, frontImage, isDoubleFaced } from './helpers'
import { toMtgCard } from './toGameCard'

/** One line of `/api/cards/resolve`, aligned by index with the request. */
export interface ResolvedRow {
  card: ScryfallCard | null
  lang: string
  error?: string
}

/**
 * Turn a server resolution into the ResolvedCard the app consumes.
 *
 * Kept pure (no Nuxt globals) so it can be tested directly: this is the one
 * place where a price, a card back or an error message could silently go
 * missing between the server and the deck page.
 */
export function toResolved(entry: DeckEntry, row: ResolvedRow | undefined, lang: string): ResolvedCard {
  const card = row?.card
  if (!card) {
    return {
      entry,
      card: null,
      imageUrl: null,
      backImageUrl: null,
      lang,
      error: row?.error ?? `Carte introuvable: ${entry.name}`,
    }
  }
  return {
    entry,
    card: toMtgCard(card),
    imageUrl: frontImage(card),
    backImageUrl: isDoubleFaced(card) ? backImage(card) : null,
    lang: row.lang,
    priceEur: card.prices?.eur ?? null,
  }
}
