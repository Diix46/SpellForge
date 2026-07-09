import type { DeckEntry } from '../useDecklist'
import type { ImageUris, ScryfallCard } from './types'

const DFC_LAYOUTS = ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card', 'art_series']

/**
 * Sanitize a card name for embedding in a Scryfall `!"name"` exact-match
 * clause: strip quotes/backslashes (either would break out of the quoted
 * clause and produce an invalid query — the likely cause of intermittent 422s
 * from EDHREC-sourced names) and trim whitespace. Callers should also drop
 * empties from the result before building a query.
 */
export function sanitizeCardName(name: string): string {
  return name.replace(/["\\]/g, '').trim()
}

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

/**
 * Map items through an async fn with bounded concurrency, preserving order.
 * `onItem`, when given, fires as each item settles (arrival order, not input
 * order) — lets a caller stream progress without waiting for the whole pool.
 */
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>, onItem?: (result: R, i: number) => void): Promise<R[]> {
  const results = Array.from({ length: items.length }) as R[]
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]!, i)
      onItem?.(results[i]!, i)
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
