import type { DeckEntry } from './useDecklist'
import type { ResolvedCard } from './useScryfall'

// Cardmarket helpers: build search/buy links for deck cards.
// Cardmarket has no public cart API, so we use the universal product search URL,
// plus a combined "open all" helper and a copy-paste wants list.

const CM_BASE = 'https://www.cardmarket.com/en/Magic'

export function useCardmarket() {
  function searchUrl(cardName: string): string {
    const q = encodeURIComponent(cardName)
    return `${CM_BASE}/Products/Search?searchString=${q}`
  }

  /** Build one search link per unique card in the deck. */
  function linksForEntries(entries: DeckEntry[]): Array<{ name: string, quantity: number, url: string }> {
    const seen = new Map<string, number>()
    for (const e of entries) {
      seen.set(e.name, (seen.get(e.name) ?? 0) + e.quantity)
    }
    return [...seen.entries()].map(([name, quantity]) => ({
      name,
      quantity,
      url: searchUrl(name),
    }))
  }

  function linksForResolved(cards: ResolvedCard[]): Array<{ name: string, quantity: number, url: string }> {
    const seen = new Map<string, number>()
    for (const c of cards) {
      // Always search by the English name for reliable Cardmarket matching.
      const name = c.card?.name ?? c.entry.name
      seen.set(name, (seen.get(name) ?? 0) + c.entry.quantity)
    }
    return [...seen.entries()].map(([name, quantity]) => ({
      name,
      quantity,
      url: searchUrl(name),
    }))
  }

  /**
   * A Cardmarket "Wants List" can be pasted in bulk on the site.
   * Format: "<qty> <card name>" per line, which matches Cardmarket's import.
   */
  function wantsListText(entries: DeckEntry[]): string {
    const seen = new Map<string, number>()
    for (const e of entries) {
      seen.set(e.name, (seen.get(e.name) ?? 0) + e.quantity)
    }
    return [...seen.entries()].map(([name, qty]) => `${qty} ${name}`).join('\n')
  }

  /** Cardmarket wants-list import page (user pastes the wants list there). */
  function wantsListImportUrl(): string {
    return `${CM_BASE}/Wants`
  }

  return {
    searchUrl,
    linksForEntries,
    linksForResolved,
    wantsListText,
    wantsListImportUrl,
  }
}
