import type { DeckEntry } from './useDecklist'
import type { ResolvedCard } from './useScryfall'

// Cardmarket helpers: build search/buy links for deck cards.
// Cardmarket has no public cart API, so we use the universal product search URL,
// plus a combined "open all" helper and a copy-paste wants list.

const CM_BASE = 'https://www.cardmarket.com/en/Magic'

/** Sum quantities by card name, preserving first-seen order. */
function aggregate<T>(items: T[], nameOf: (item: T) => string, qtyOf: (item: T) => number): Array<[string, number]> {
  const seen = new Map<string, number>()
  for (const item of items) {
    const name = nameOf(item)
    seen.set(name, (seen.get(name) ?? 0) + qtyOf(item))
  }
  return [...seen.entries()]
}

export function useCardmarket() {
  function searchUrl(cardName: string): string {
    const q = encodeURIComponent(cardName)
    return `${CM_BASE}/Products/Search?searchString=${q}`
  }

  /** Build one search link per unique card (search by English name for reliable matching). */
  function linksForResolved(cards: ResolvedCard[]): Array<{ name: string, quantity: number, url: string }> {
    return aggregate(cards, c => c.card?.name ?? c.entry.name, c => c.entry.quantity)
      .map(([name, quantity]) => ({ name, quantity, url: searchUrl(name) }))
  }

  /**
   * A Cardmarket "Wants List" can be pasted in bulk on the site.
   * Format: "<qty> <card name>" per line, which matches Cardmarket's import.
   */
  function wantsListText(entries: DeckEntry[]): string {
    return aggregate(entries, e => e.name, e => e.quantity)
      .map(([name, qty]) => `${qty} ${name}`)
      .join('\n')
  }

  /** Cardmarket wants-list import page (user pastes the wants list there). */
  function wantsListImportUrl(): string {
    return `${CM_BASE}/Wants`
  }

  return {
    searchUrl,
    linksForResolved,
    wantsListText,
    wantsListImportUrl,
  }
}
