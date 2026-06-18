import type { DeckEntry } from './useDecklist'
import type { ResolvedCard } from './useScryfall'

// Cardmarket helpers: build search/buy links for deck cards.
// Cardmarket has no public cart API, so we use the universal product search URL,
// plus a combined "open all" helper and a copy-paste wants list.

// Cardmarket site language to URL segment. Card *matching* is always by English
// name (most reliable), but the user can browse the marketplace in their language.
export type BuyLang = 'fr' | 'en'
const CM_LOCALE_SEG: Record<BuyLang, string> = { fr: 'fr', en: 'en' }
function cmBase(lang: BuyLang): string {
  return `https://www.cardmarket.com/${CM_LOCALE_SEG[lang]}/Magic`
}

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
  function searchUrl(cardName: string, lang: BuyLang = 'en'): string {
    const q = encodeURIComponent(cardName)
    return `${cmBase(lang)}/Products/Search?searchString=${q}`
  }

  /** Build one search link per unique card (search by English name for reliable matching). */
  function linksForResolved(cards: ResolvedCard[], lang: BuyLang = 'en'): Array<{ name: string, quantity: number, url: string }> {
    return aggregate(cards, c => c.card?.name ?? c.entry.name, c => c.entry.quantity)
      .map(([name, quantity]) => ({ name, quantity, url: searchUrl(name, lang) }))
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
  function wantsListImportUrl(lang: BuyLang = 'en'): string {
    return `${cmBase(lang)}/Wants`
  }

  return {
    searchUrl,
    linksForResolved,
    wantsListText,
    wantsListImportUrl,
  }
}
