/**
 * The generic engine's decks: a decklist of printings in zones (main, extra,
 * side…), checked by each game's rules. Pure: the builder runs it on every
 * edit, the tests without Nuxt.
 *
 * The list is plain text, what players copy and paste:
 *
 *   4 sv03.5-006
 *   2 sv06-167 Legacy Energy
 *   ## Extra
 *   1 89631139
 *
 * A quantity, an optional "x", a printing id, anything after it ignored (the
 * card's name, for a reader). A heading names the zone of the lines below it;
 * lines before any heading go to the game's first zone. A first line
 * "// format: expanded" names the format the deck is built for, when it is
 * not the game's first.
 */
import type { DeckEntry, ParseResult } from '../decklist'
import type { TcgCard } from './types'

export interface TcgZone {
  id: string
  /** Cards it must hold, and may hold. */
  min: number
  max: number
}

export interface TcgIssue {
  code: string
  level: 'error' | 'warning'
  /** The card(s) concerned, by name; numbers for the message. */
  cards?: string[]
  count?: number
  max?: number
  zone?: string
}

export interface TcgLine {
  entry: DeckEntry
  card: TcgCard | null
}

export interface TcgValidation {
  legal: boolean
  /** Cards per zone. */
  counts: Record<string, number>
  issues: TcgIssue[]
}

/** What a game's deckbuilding rules say. */
export interface TcgRules {
  /** The deck's zones, the first one the main deck. */
  zones: readonly TcgZone[]
  /** Formats the rules can check, the first one the default. */
  formats: readonly string[]
  /** Where a card goes when added (to this deck: Riftbound's Chosen Champion). */
  zoneFor: (card: TcgCard, lines?: readonly TcgLine[]) => string
  /** Whether a card may sit in a zone. */
  fits?: (card: TcgCard, zone: string) => boolean
  /** Copies of one card (all printings, all zones) a deck may hold. */
  copyLimit: (card: TcgCard) => number
  /** Rules on the whole deck beyond sizes and copies (a Basic Pokémon, one ACE SPEC…). */
  check?: (lines: readonly TcgLine[], format: string) => TcgIssue[]
  /** Rules against adding a card beyond its copies (a second ACE SPEC). */
  refuse?: (lines: readonly TcgLine[], card: TcgCard) => string | null
}

const LINE = /^(\d{1,2})(?:\s+(?:[x×]\s+)?|[x×]\s+)([\w.\-]{1,40})(?:\s.*)?$/i
const HEADING = /^(?:#{1,3}|!)?\s*([a-z]+)\s*(?::\s*)?$/i
const COMMENT = /^\/\//

export function parseTcgDecklist(raw: string, zones: readonly TcgZone[]): ParseResult {
  const ids = new Set(zones.map(z => z.id))
  const main = zones[0]!.id
  let zone = main
  const mainboard: DeckEntry[] = []
  const errors: string[] = []
  for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (COMMENT.test(line))
      continue
    // Prism's headings only ("## Extra"): another app's "Champion:" is left to
    // the import, which places those cards by the rules.
    const heading = /^(?:#{1,3}|!)/.test(line) ? HEADING.exec(line) : null
    if (heading && ids.has(heading[1]!.toLowerCase())) {
      zone = heading[1]!.toLowerCase()
      continue
    }
    const m = LINE.exec(line)
    // A printing id carries a digit ("sv03.5-006", "LOB-EN005"): "1 Jinx - Loose
    // Cannon" is a name, for the import to match.
    if (!m || !/\d/.test(m[2]!)) {
      errors.push(line)
      continue
    }
    const entry: DeckEntry = { quantity: Number(m[1]), name: m[2]! }
    if (zone !== main)
      entry.zone = zone
    mainboard.push(entry)
  }
  return { mainboard, sideboard: [], errors }
}

const FORMAT = /^\/\/\s*format:\s*([a-z]+)\s*$/im

/** The format a list names, else the game's first. */
export function readTcgFormat(raw: string, formats: readonly string[]): string {
  const f = FORMAT.exec(raw)?.[1]?.toLowerCase()
  return f && formats.includes(f) ? f : formats[0] ?? ''
}

/** The list as text, zone by zone, its format first when not the default one. */
export function writeTcgDecklist(entries: readonly DeckEntry[], zones: readonly TcgZone[], unreadable: readonly string[] = [], format?: { value: string, formats: readonly string[] }): string {
  const main = zones[0]!.id
  const out: string[] = []
  if (format && format.value && format.value !== format.formats[0])
    out.push(`// format: ${format.value}`)
  for (const z of zones) {
    const own = entries.filter(e => (e.zone ?? main) === z.id)
    if (!own.length)
      continue
    if (z.id !== main)
      out.push(`## ${z.id[0]!.toUpperCase()}${z.id.slice(1)}`)
    out.push(...own.map(e => `${e.quantity} ${e.name}`))
  }
  return [...out, ...unreadable].join('\n')
}

export const zoneOf = (e: DeckEntry, rules: TcgRules) => e.zone ?? rules.zones[0]!.id

/** Copies of a card (every printing, every zone). */
export function copiesOf(lines: readonly TcgLine[], key: string): number {
  return lines.reduce((n, l) => n + (l.card?.key === key ? l.entry.quantity : 0), 0)
}

export function zoneCount(lines: readonly TcgLine[], zone: string, rules: TcgRules): number {
  return lines.reduce((n, l) => n + (zoneOf(l.entry, rules) === zone ? l.entry.quantity : 0), 0)
}

/** Copies of a card a deck may hold: the rules', lowered by the banlist. */
export function limitOf(rules: TcgRules, card: TcgCard): number {
  return Math.min(rules.copyLimit(card), card.limit ?? Infinity)
}

export type TcgAddVerdict = { ok: true, zone: string } | { ok: false, reason: string }

/** Whether one more copy of a card fits, and where. */
export function canAdd(rules: TcgRules, lines: readonly TcgLine[], card: TcgCard, zone = rules.zoneFor(card, lines)): TcgAddVerdict {
  if (card.banned)
    return { ok: false, reason: 'banned' }
  if (rules.fits && !rules.fits(card, zone))
    return { ok: false, reason: 'wrongZone' }
  if (copiesOf(lines, card.key) >= limitOf(rules, card))
    return { ok: false, reason: 'maxCopies' }
  const z = rules.zones.find(x => x.id === zone)
  if (z && zoneCount(lines, zone, rules) >= z.max)
    return { ok: false, reason: 'zoneFull' }
  const refused = rules.refuse?.(lines, card)
  return refused ? { ok: false, reason: refused } : { ok: true, zone }
}

/** Sizes and copies, then the game's own rules. Lines not resolved yet are left out. */
export function validateTcgDeck(rules: TcgRules, lines: readonly TcgLine[], format = rules.formats[0] ?? ''): TcgValidation {
  const issues: TcgIssue[] = []
  const counts: Record<string, number> = {}
  for (const z of rules.zones) {
    const n = zoneCount(lines, z.id, rules)
    counts[z.id] = n
    if (n < z.min || n > z.max)
      issues.push({ code: 'zoneSize', level: 'error', zone: z.id, count: n, max: n > z.max ? z.max : z.min })
  }
  const seen = new Map<string, { card: TcgCard, n: number }>()
  for (const l of lines) {
    if (!l.card)
      continue
    const s = seen.get(l.card.key)
    if (s)
      s.n += l.entry.quantity
    else
      seen.set(l.card.key, { card: l.card, n: l.entry.quantity })
    if (rules.fits && !rules.fits(l.card, zoneOf(l.entry, rules)))
      issues.push({ code: 'wrongZone', level: 'error', cards: [l.card.name], zone: zoneOf(l.entry, rules) })
  }
  const notLegal: string[] = []
  for (const { card, n } of seen.values()) {
    const max = limitOf(rules, card)
    if (n > max)
      issues.push({ code: 'tooManyCopies', level: 'error', cards: [card.name], count: n, max })
    if (card.banned)
      issues.push({ code: 'banned', level: 'error', cards: [card.name] })
    else if (format && !card.legal.includes(format))
      notLegal.push(card.name)
  }
  if (notLegal.length)
    issues.push({ code: 'notInFormat', level: 'warning', cards: notLegal })
  issues.push(...(rules.check?.(lines, format) ?? []))
  return { legal: !issues.some(i => i.level === 'error'), counts, issues }
}

/** A list line as other apps write it: a name, maybe a set and a number. */
export interface ForeignLine { quantity: number, name: string, set: string | null, number: string | null }

// Pokémon TCG Live's energy symbols, as it writes basic Energy.
const ENERGY_SYMBOL: Record<string, string> = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', Y: 'Fairy' }
// Read word by word, from both ends: a quantity first, a set and a number last.
const QUANTITY = /^\d{1,2}x?$/
const SET = /^[A-Z][A-Z0-9-]{1,7}$/
const NUMBER = /^[A-Z]{0,3}\d{1,4}[a-z]?$/
// Section headings: "Pokémon: 12", "Trainer: 36", "Total Cards: 60", "MainDeck:".
const SECTION = /^\D.*:\s*\d*$/

/**
 * Lines of another app's list (Pokémon TCG Live: "4 Charizard ex OBF 125",
 * "8 Basic {R} Energy Energy 2"), for the server to match to printings
 * (/api/tcg/<game>/match). Headings are skipped; what reads as neither is
 * returned apart.
 */
export function parseForeignLines(lines: readonly string[]): { lines: ForeignLine[], rest: string[] } {
  const out: ForeignLine[] = []
  const rest: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || SECTION.test(line))
      continue
    const words = line.split(/\s+/)
    if (words.length < 2 || !QUANTITY.test(words[0]!)) {
      rest.push(line)
      continue
    }
    let set: string | null = null
    let number: string | null = null
    // Basic Energy: "8 Basic {R} Energy Energy 2", no set to it.
    if (words.length >= 4 && words.at(-2) === 'Energy' && /^\d+$/.test(words.at(-1)!)) {
      words.splice(-2)
    }
    else if (words.length >= 4 && SET.test(words.at(-2)!) && NUMBER.test(words.at(-1)!)) {
      number = words.pop()!
      set = words.pop()!
    }
    const name = words.slice(1).join(' ').replace(/\{([A-Z])\}/g, (_, sym: string) => ENERGY_SYMBOL[sym] ?? sym)
    out.push({ quantity: Number.parseInt(words[0]!, 10), name, set, number })
  }
  return { lines: out, rest }
}

/** A YDK file (YGOPRODeck, EDOPro, Master Duel): passcodes one per line under #main, #extra, !side. */
export function isYdk(text: string): boolean {
  return /^#main\s*$/m.test(text)
}

/** Passcodes and their copies, zone by zone, in the order they come. */
export function parseYdk(text: string): { code: string, zone: string, quantity: number }[] {
  const out: { code: string, zone: string, quantity: number }[] = []
  let zone = 'main'
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const head = /^[#!](main|extra|side)\s*$/i.exec(line)
    if (head) {
      zone = head[1]!.toLowerCase()
      continue
    }
    if (!/^\d{1,10}$/.test(line))
      continue
    const same = out.find(e => e.code === line && e.zone === zone)
    if (same)
      same.quantity++
    else
      out.push({ code: line, zone, quantity: 1 })
  }
  return out
}
