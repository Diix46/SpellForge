/**
 * A printing's look, as the ingest stores it: a bit mask in `printings.style`
 * (scripts/ingest-mtg.mjs, styleOf — a test holds the two together).
 */
export const ART_STYLES = {
  fullart: 1,
  borderless: 2,
  showcase: 4,
  extendedart: 8,
  oldframe: 16,
  etched: 32,
} as const
export type ArtStyle = keyof typeof ART_STYLES

/** The styles set in a mask, in ART_STYLES order. */
export function stylesOf(mask: number): ArtStyle[] {
  return (Object.keys(ART_STYLES) as ArtStyle[]).filter(s => (mask & ART_STYLES[s]) !== 0)
}

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
  artist: string | null
  /** Full-art, borderless, showcase… — empty for a regular frame. */
  styles: ArtStyle[]
}

/**
 * `set/number@lang`, lowercased set: the key the picker and pins compare on.
 * The language is part of it: Lorwyn #155 exists in French and in English.
 */
export function printKey(set: string, collectorNumber: string, lang: string): string {
  return `${set.toLowerCase()}/${collectorNumber}@${lang}`
}

/** A pin as the decklist stores it: `(SET) NUM`, plus "[EN]" (`lang: 'en'`). */
export interface PinFields {
  set?: string
  collectorNumber?: string
  lang?: 'en'
}

/** The same pin as written in the list (set codes compare in any case). */
export function samePin(a: PinFields, b: PinFields): boolean {
  return (a.set ?? '').toLowerCase() === (b.set ?? '').toLowerCase()
    && (a.collectorNumber ?? '') === (b.collectorNumber ?? '')
    && (a.lang ?? '') === (b.lang ?? '')
}

/**
 * The printing a pin asks for on a deck shown in `deckLang`: its own language
 * when marked "[EN]", the deck's otherwise. Empty when nothing is pinned.
 */
export function pinPrintKey(pin: PinFields, deckLang: string): string {
  return pin.set && pin.collectorNumber ? printKey(pin.set, pin.collectorNumber, pin.lang ?? deckLang) : ''
}

/**
 * The pin that shows `print` on a deck in `deckLang`, given every printing of
 * the card. Marked "[EN]" only when the card exists in the deck's language: a
 * card printed in English only shows in English anyway, and needs no marker.
 */
export function pinFor(print: PrintOption, deckLang: string, cardPrints: readonly PrintOption[]): PinFields {
  const marked = print.lang === 'en' && deckLang !== 'en' && cardPrints.some(p => p.lang === deckLang)
  return {
    set: print.set,
    collectorNumber: print.collectorNumber,
    ...(marked ? { lang: 'en' as const } : {}),
  }
}

/**
 * The printings a card can show in `lang` without an explicit "[EN]" pin: those
 * in `lang` when there are any, English otherwise. Same rule as deck resolution.
 */
export function displayable(prints: PrintOption[], lang: string): PrintOption[] {
  const own = prints.filter(p => p.lang === lang)
  return own.length ? own : prints.filter(p => p.lang === 'en')
}

/**
 * A deck-wide artwork choice. `set` pins every card that has a printing in that
 * set; `english` pins the best English printing (high resolution first).
 */
export type BulkArtMode
  = | { kind: 'auto' }
    | { kind: 'oldest' }
    | { kind: 'newest' }
    | { kind: 'set', set: string }
    | { kind: 'english' }
    | { kind: 'style', style: ArtStyle }
    | { kind: 'artist', artist: string }

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
export function pickPrint(prints: PrintOption[], mode: BulkArtMode, deckLang = 'en'): PrintOption | null | undefined {
  if (mode.kind === 'auto')
    return null
  if (mode.kind === 'style' || mode.kind === 'artist') {
    // A theme is about the look: the deck's language when a matching printing
    // exists in it, English otherwise (pinned "[EN]" by the caller).
    const matches = (p: PrintOption) => mode.kind === 'style' ? p.styles.includes(mode.style) : p.artist === mode.artist
    const own = displayable(prints, deckLang).filter(matches)
    const pool = regularFirst(own.length ? own : prints.filter(p => p.lang === 'en' && matches(p)))
    const hd = pool.filter(p => p.highres)
    return (hd.length ? hd : pool).sort(byDate).at(-1)
  }
  if (mode.kind === 'english') {
    // High resolution first, then the newest regular printing.
    const english = regularFirst(prints.filter(p => p.lang === 'en'))
    const hd = english.filter(p => p.highres)
    return (hd.length ? hd : english).sort(byDate).at(-1)
  }
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

export interface ThemeCoverage {
  styles: { style: ArtStyle, cards: number }[]
  artists: { artist: string, cards: number }[]
}

/**
 * How many of the deck's cards each theme can reach, in any language (a theme
 * falls back to English). Styles in ART_STYLES order, artists most cards first.
 */
export function themeCoverage(printsByName: Map<string, PrintOption[]>, artistLimit = 30): ThemeCoverage {
  const styleCount = new Map<ArtStyle, number>()
  const artistCount = new Map<string, number>()
  for (const prints of printsByName.values()) {
    for (const s of new Set(prints.flatMap(p => p.styles)))
      styleCount.set(s, (styleCount.get(s) ?? 0) + 1)
    for (const a of new Set(prints.map(p => p.artist).filter((a): a is string => !!a)))
      artistCount.set(a, (artistCount.get(a) ?? 0) + 1)
  }
  return {
    styles: (Object.keys(ART_STYLES) as ArtStyle[])
      .filter(s => styleCount.has(s))
      .map(style => ({ style, cards: styleCount.get(style)! })),
    artists: [...artistCount]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, artistLimit)
      .map(([artist, cards]) => ({ artist, cards })),
  }
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
