/**
 * Magic decklist text: "<qty> <name>", optionally followed by an MTG Arena
 * "(SET) NUM" suffix that pins a printing, with Arena section headers.
 */
import type { DeckEntry, DecklistFormat, ParseResult } from '../decklist'

// "<qty> <rest>" — the rest starts at a non-space char so the gap quantifier
// and the rest capture can't overlap (keeps the match linear, no ReDoS).
const QTY_LINE = /^(\d+)[ \t]+(\S.*)$/
// Optional MTG Arena suffix at the end of the name: " (SET) 123". Collector
// numbers are not always digits ("BLC-129", "1494★", "12a"): any token holding
// a digit counts. Set codes are read in any case and written in capitals.
const SET_SUFFIX = /[ \t]+\(([a-z0-9]{2,8})\)[ \t]+(\S+)$/i
const SECTION_HEADERS = /^(?:Deck|Sideboard|Commander|Companion)$/i
// Our own marker after the suffix: this printing, in English, even on a French
// deck. Not Arena syntax — text exports drop it (see withoutLangMarkers).
const LANG_MARKER = /[ \t]+\[EN\]$/i

export function parseMtgDecklist(raw: string): ParseResult {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const mainboard: DeckEntry[] = []
  const sideboard: DeckEntry[] = []
  const commanders: string[] = []
  const errors: string[] = []

  // The companion sits outside the hundred, like the sideboard.
  let section: 'deck' | 'commander' | 'side' = 'deck'

  for (const line of lines) {
    if (SECTION_HEADERS.test(line)) {
      const header = line.toLowerCase()
      section = header === 'sideboard' || header === 'companion' ? 'side' : header === 'commander' ? 'commander' : 'deck'
      continue
    }

    const match = line.match(QTY_LINE)
    if (!match) {
      errors.push(line)
      continue
    }

    const quantity = Number.parseInt(match[1] ?? '1')
    let rest = (match[2] ?? '').trim()

    // Peel off an optional "[EN]" marker, then the Arena "(SET) NUM" suffix.
    const marker = rest.match(LANG_MARKER)
    if (marker)
      rest = rest.slice(0, marker.index).trim()
    let set: string | undefined
    let collectorNumber: string | undefined
    let lang: 'en' | undefined
    const suffix = rest.match(SET_SUFFIX)
    if (suffix && /\d/.test(suffix[2] ?? '')) {
      set = suffix[1]?.toUpperCase()
      collectorNumber = suffix[2]
      // The marker only means something on a pinned printing.
      lang = marker ? 'en' : undefined
      rest = rest.slice(0, suffix.index ?? rest.length).trim()
    }

    const entry: DeckEntry = { quantity, name: rest, set, collectorNumber, ...(lang ? { lang } : {}) }
    if (section === 'side') {
      sideboard.push(entry)
      continue
    }
    if (section === 'commander')
      commanders.push(rest)
    mainboard.push(entry)
  }

  return { mainboard, sideboard, commanders, errors }
}

/**
 * The list as text. A chosen commander goes under its own header, the way
 * Arena and most deck sites write it, so the choice survives a reload.
 */
export function writeMtgDecklist(mainboard: readonly DeckEntry[], sideboard: readonly DeckEntry[], commander = ''): string {
  const key = commander.trim().toLowerCase()
  const lead = key ? mainboard.find(e => e.name.trim().toLowerCase() === key) : undefined
  const lines = lead
    ? ['Commander', mtgLine(lead), '', 'Deck', ...mainboard.filter(e => e !== lead).map(mtgLine)]
    : mainboard.map(mtgLine)
  if (sideboard.length)
    lines.push('', 'Sideboard', ...sideboard.map(mtgLine))
  return lines.join('\n')
}

/** A pinned printing round-trips as the Arena suffix, plus " [EN]" when wanted in English. */
export function mtgLine(entry: DeckEntry): string {
  const pinned = !!(entry.set && entry.collectorNumber)
  const suffix = pinned ? ` (${entry.set!.toUpperCase()}) ${entry.collectorNumber}` : ''
  const marker = pinned && entry.lang === 'en' ? ' [EN]' : ''
  return `${entry.quantity} ${entry.name}${suffix}${marker}`
}

/**
 * The list as other sites read it: without our "[EN]" markers, which Arena,
 * Moxfield and the rest do not know.
 */
export function withoutLangMarkers(raw: string): string {
  return raw.split('\n').map(l => l.replace(LANG_MARKER, '')).join('\n')
}

export const mtgDecklist: DecklistFormat = { parse: parseMtgDecklist, line: mtgLine }
