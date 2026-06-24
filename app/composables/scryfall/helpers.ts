import type { DeckEntry } from '../useDecklist'
import type { ImageUris, ResolvedCard, ScryfallCard } from './types'

const DFC_LAYOUTS = ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card', 'art_series']

export function isDoubleFaced(card: ScryfallCard): boolean {
  return DFC_LAYOUTS.includes(card.layout) && !!card.card_faces?.[1]?.image_uris
}

/**
 * The image_uris for a card, falling back to the first face (DFCs carry their
 * art per-face, not on the card root). Pick the quality you want off the result.
 */
export function getImageUris(card: ScryfallCard | null | undefined): ImageUris | undefined {
  return card?.image_uris ?? card?.card_faces?.[0]?.image_uris
}

export function frontImage(card: ScryfallCard, quality: 'normal' | 'large' | 'png' = 'large'): string | null {
  const uris = getImageUris(card)
  return uris ? (uris[quality] ?? uris.normal) : null
}

export function backImage(card: ScryfallCard, quality: 'normal' | 'large' | 'png' = 'large'): string | null {
  if (card.card_faces?.[1]?.image_uris) {
    return card.card_faces[1].image_uris[quality] ?? card.card_faces[1].image_uris.normal
  }
  return null
}

/** Map items through an async fn with bounded concurrency, preserving order. */
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
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

export function hasImage(card: ScryfallCard | null): boolean {
  return !!getImageUris(card)
}

// A "real" image excludes Scryfall's "Localized Image Not Available" placeholders.
export function hasRealImage(card: ScryfallCard | null): boolean {
  if (!hasImage(card))
    return false
  const status = card!.image_status
  return status !== 'placeholder' && status !== 'missing'
}

// Build a quick ResolvedCard from a matched (default/EN) Scryfall card — used
// for the instant first paint before FR art is resolved.
export function quickResolved(entry: DeckEntry, match: ScryfallCard | null, lang: string): ResolvedCard {
  if (!match)
    return { entry, card: null, imageUrl: null, backImageUrl: null, lang, error: `Carte introuvable: ${entry.name}` }
  return {
    entry,
    card: match,
    imageUrl: frontImage(match),
    backImageUrl: isDoubleFaced(match) ? backImage(match) : null,
    lang: match.lang,
    priceEur: match.prices?.eur ?? null,
  }
}

export function findMatch(cards: ScryfallCard[], entry: DeckEntry): ScryfallCard | null {
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
