import type { DeckEntry } from './decklist'
import type { GameId } from './game'
import { parseMtgDecklist, writeMtgDecklist } from './mtg/decklist'
import { optcgLine, parseOptcgDecklist } from './optcg/decklist'
import { parseTcgDecklist, readTcgFormat, writeTcgDecklist } from './tcg/deck'
import { TCG_RULES } from './tcg/rules'
import { isTcgGame } from './tcg/types'

/**
 * One more copy of a card in a deck's list, written back in the game's own
 * format (Magic's Commander section, One Piece's `1xOP01-001`, the generic
 * engine's zones and format line kept). `key` is what the list names a card
 * by: Magic's English name, One Piece's number, a printing id otherwise.
 * `zone`: where a generic-engine card goes (its rules decide; main deck when
 * absent). A Magic card already in the deck is left alone (Commander allows
 * one copy); elsewhere the copies add up, the builder saying what is too many.
 */
export function addToDecklist(game: GameId, raw: string, key: string, zone?: string): { raw: string, added: boolean } {
  const same = (e: DeckEntry) => e.name.trim().toLowerCase() === key.trim().toLowerCase()
  if (game === 'mtg') {
    const parsed = parseMtgDecklist(raw)
    if ([...parsed.mainboard, ...parsed.sideboard].some(same))
      return { raw, added: false }
    const main = [...parsed.mainboard, { quantity: 1, name: key }]
    return { raw: writeMtgDecklist(main, parsed.sideboard, parsed.commanders?.[0] ?? ''), added: true }
  }
  if (game === 'optcg') {
    const parsed = parseOptcgDecklist(raw)
    const found = parsed.mainboard.find(e => same(e) && !e.art)
    const main = found
      ? parsed.mainboard.map(e => (e === found ? { ...e, quantity: e.quantity + 1 } : e))
      : [...parsed.mainboard, { quantity: 1, name: key.toUpperCase() }]
    return { raw: [...main.map(optcgLine), ...parsed.errors].join('\n'), added: true }
  }
  if (isTcgGame(game)) {
    const rules = TCG_RULES[game]
    const main = rules.zones[0]!.id
    const target = zone && zone !== main ? zone : undefined
    const parsed = parseTcgDecklist(raw, rules.zones)
    const found = parsed.mainboard.find(e => same(e) && e.zone === target)
    const entries = found
      ? parsed.mainboard.map(e => (e === found ? { ...e, quantity: e.quantity + 1 } : e))
      : [...parsed.mainboard, { quantity: 1, name: key, ...(target ? { zone: target } : {}) }]
    return { raw: writeTcgDecklist(entries, rules.zones, parsed.errors, { value: readTcgFormat(raw, rules.formats), formats: rules.formats }), added: true }
  }
  return { raw, added: false }
}
