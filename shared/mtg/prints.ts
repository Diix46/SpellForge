/**
 * One printing of a card, as the edition picker and the deck-wide illustration
 * actions consume it. Served by `/api/cards/prints` (one card) and its POST
 * form (a whole deck).
 */
export interface PrintOption {
  id: string
  set: string
  setName: string
  collectorNumber: string
  lang: string
  /** Thumbnail (normal size). */
  image: string | null
  /** Big image, for the detail view's preview on hover. */
  imageLarge: string | null
  priceEur: string | null
  promo: boolean
  /** False for Scryfall's low-resolution scans — shown as "low-res" in the picker. */
  highres: boolean
  releasedAt: string | null
}

/** `set/number`, lowercased set: the key the picker and pins compare on. */
export function printKey(set: string, collectorNumber: string): string {
  return `${set.toLowerCase()}/${collectorNumber}`
}

/** A deck-wide artwork choice. `set` pins every card that has a printing in that set. */
export type BulkArtMode = { kind: 'auto' } | { kind: 'oldest' } | { kind: 'newest' } | { kind: 'set', set: string }

// Promos (prerelease stamps, buy-a-box…) only when a card has nothing else: a
// "newest" deck should not turn into a wall of stamped foils.
function regularFirst(prints: PrintOption[]): PrintOption[] {
  const regular = prints.filter(p => !p.promo)
  return regular.length ? regular : prints
}

const byDate = (a: PrintOption, b: PrintOption) => (a.releasedAt ?? '').localeCompare(b.releasedAt ?? '')

/**
 * The printing a deck-wide action pins on one card: null clears the pin
 * (automatic), undefined leaves the card as it is (no printing in that set).
 */
export function pickPrint(prints: PrintOption[], mode: BulkArtMode): PrintOption | null | undefined {
  if (mode.kind === 'auto')
    return null
  if (!prints.length)
    return undefined
  if (mode.kind === 'set') {
    const set = mode.set.toLowerCase()
    const inSet = prints.filter(p => p.set.toLowerCase() === set)
    return regularFirst(inSet).sort((a, b) => a.collectorNumber.localeCompare(b.collectorNumber, undefined, { numeric: true }))[0]
  }
  const sorted = regularFirst(prints).sort(byDate)
  return mode.kind === 'oldest' ? sorted[0] : sorted.at(-1)
}

export interface SetCoverage {
  set: string
  setName: string
  /** How many of the deck's cards have a printing in this set. */
  cards: number
}

/**
 * The sets a deck could be unified on, most cards covered first, then the most
 * recent. Sets covering a single card are left out: nothing to unify.
 */
export function setCoverage(printsByName: Map<string, PrintOption[]>, limit = 40): SetCoverage[] {
  const sets = new Map<string, SetCoverage & { releasedAt: string }>()
  for (const prints of printsByName.values()) {
    for (const set of new Set(prints.map(p => p.set.toLowerCase()))) {
      const first = prints.find(p => p.set.toLowerCase() === set)!
      const s = sets.get(set) ?? { set, setName: first.setName, cards: 0, releasedAt: first.releasedAt ?? '' }
      s.cards++
      sets.set(set, s)
    }
  }
  return [...sets.values()]
    .filter(s => s.cards > 1)
    .sort((a, b) => b.cards - a.cards || b.releasedAt.localeCompare(a.releasedAt))
    .slice(0, limit)
    .map(({ set, setName, cards }) => ({ set, setName, cards }))
}
