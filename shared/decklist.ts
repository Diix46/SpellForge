/**
 * The decklist model shared by every game. A deck is stored as plain text —
 * what players copy and paste — and each game has its own line format.
 */

export interface DeckEntry {
  quantity: number
  /**
   * The join key: the canonical English name for Magic, the card number for
   * One Piece (whose names are translated and not unique).
   */
  name: string
  /** Magic: a pinned printing, the Arena "(SET) NUM" suffix. */
  set?: string
  collectorNumber?: string
  /** One Piece: a pinned art, "OP01-016_p1". */
  art?: string
}

export interface ParseResult {
  mainboard: DeckEntry[]
  sideboard: DeckEntry[]
  /** Lines that could not be read, as typed. */
  errors: string[]
}

export interface DecklistFormat {
  parse: (raw: string) => ParseResult
  /** One line per entry, in order. */
  line: (entry: DeckEntry) => string
}

export function totalCards(entries: readonly DeckEntry[]): number {
  return entries.reduce((sum, e) => sum + e.quantity, 0)
}

/** Lookup key for an entry name, so every map normalises the same way. */
export function entryKey(name: string): string {
  return name.trim().toLowerCase()
}
