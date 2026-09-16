/**
 * Magic decklist text: "<qty> <name>", optionally followed by an MTG Arena
 * "(SET) NUM" suffix that pins a printing, with Arena section headers.
 */
import type { DeckEntry, DecklistFormat, ParseResult } from '../decklist'

// "<qty> <rest>" — the rest starts at a non-space char so the gap quantifier
// and the rest capture can't overlap (keeps the match linear, no ReDoS).
const QTY_LINE = /^(\d+)[ \t]+(\S.*)$/
// Optional MTG Arena suffix at the end of the name: " (SET) 123".
const SET_SUFFIX = /[ \t]+\(([A-Z0-9]+)\)[ \t]+(\d+)$/
const SECTION_HEADERS = /^(?:Deck|Sideboard|Commander|Companion)$/i

export function parseMtgDecklist(raw: string): ParseResult {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const mainboard: DeckEntry[] = []
  const sideboard: DeckEntry[] = []
  const errors: string[] = []

  let inSideboard = false

  for (const line of lines) {
    if (SECTION_HEADERS.test(line)) {
      inSideboard = line.toLowerCase() === 'sideboard'
      continue
    }

    const match = line.match(QTY_LINE)
    if (!match) {
      errors.push(line)
      continue
    }

    const quantity = Number.parseInt(match[1] ?? '1')
    let rest = (match[2] ?? '').trim()

    // Peel off an optional Arena "(SET) NUM" suffix.
    let set: string | undefined
    let collectorNumber: string | undefined
    const suffix = rest.match(SET_SUFFIX)
    if (suffix) {
      set = suffix[1]
      collectorNumber = suffix[2]
      rest = rest.slice(0, suffix.index ?? rest.length).trim()
    }

    const entry: DeckEntry = { quantity, name: rest, set, collectorNumber }
    if (inSideboard)
      sideboard.push(entry)
    else mainboard.push(entry)
  }

  return { mainboard, sideboard, errors }
}

/** A pinned printing round-trips as the Arena suffix. */
export function mtgLine(entry: DeckEntry): string {
  const suffix = entry.set && entry.collectorNumber ? ` (${entry.set.toUpperCase()}) ${entry.collectorNumber}` : ''
  return `${entry.quantity} ${entry.name}${suffix}`
}

export const mtgDecklist: DecklistFormat = { parse: parseMtgDecklist, line: mtgLine }
