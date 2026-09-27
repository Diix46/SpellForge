/**
 * Riftbound deck rules — Core Rules, deck construction:
 *
 * - one Champion Legend, whose domains (two) bound the whole deck;
 * - a Chosen Champion: a Champion unit of the Legend's champion, apart;
 * - a Main Deck of at least 40 cards with the Chosen Champion (39 here, the
 *   Champion counted in its own zone), at most 3 copies of a card by name;
 * - every card's domains among the Legend's (Colorless always fits);
 * - at most 3 Signature cards, all of the Legend's champion;
 * - a Rune Deck of 12 Runes of the Legend's domains;
 * - 3 Battlefields, all different.
 *
 * A Legend names its champion by its first tag ("Vi"); a Champion unit and a
 * Signature card carry the same tag.
 */
import type { TcgIssue, TcgLine, TcgRules } from '../deck'
import type { TcgCard } from '../types'
import { zoneOf } from '../deck'

const champion = (card: TcgCard | null | undefined) => card?.tags[0] ?? null
const legendOf = (lines: readonly TcgLine[]) => lines.find(l => l.card?.category === 'Legend')?.card ?? null

/** Whether a card may go in a deck led by this Legend: its domains among the Legend's. */
function inDomains(card: TcgCard, legend: TcgCard | null): boolean {
  if (!legend)
    return true
  return card.types.every(d => d === 'Colorless' || legend.types.includes(d))
}

const ZONE_OF_CATEGORY: Record<string, string> = { Legend: 'legend', Rune: 'runes', Battlefield: 'battlefields' }

export const RIFTBOUND_RULES: TcgRules = {
  zones: [
    { id: 'main', min: 39, max: 99 },
    { id: 'legend', min: 1, max: 1 },
    { id: 'champion', min: 1, max: 1 },
    { id: 'runes', min: 12, max: 12 },
    { id: 'battlefields', min: 3, max: 3 },
  ],
  formats: ['standard'],
  zoneFor(card, lines = []) {
    const zone = ZONE_OF_CATEGORY[card.category]
    if (zone)
      return zone
    // The first Champion unit of the Legend's champion becomes the Chosen Champion.
    const legend = legendOf(lines)
    const chosen = lines.some(l => zoneOf(l.entry, RIFTBOUND_RULES) === 'champion')
    if (card.category === 'Unit' && card.subtype === 'Champion' && !chosen && (!legend || champion(card) === champion(legend)))
      return 'champion'
    return 'main'
  },
  fits(card, zone) {
    const home = ZONE_OF_CATEGORY[card.category]
    if (home)
      return zone === home
    if (zone === 'champion')
      return card.category === 'Unit' && card.subtype === 'Champion'
    return zone === 'main'
  },
  // Runes are basic: as many as the Rune Deck holds. A Battlefield once.
  copyLimit: card => (card.category === 'Rune' ? Infinity : card.category === 'Battlefield' ? 1 : 3),
  refuse(lines, card) {
    const legend = legendOf(lines)
    if (card.category !== 'Legend' && !inDomains(card, legend))
      return 'offDomain'
    if (card.subtype === 'Signature') {
      if (legend && champion(card) !== champion(legend))
        return 'signatureChampion'
      const signatures = lines.reduce((n, l) => n + (l.card?.subtype === 'Signature' ? l.entry.quantity : 0), 0)
      if (signatures >= 3)
        return 'signatureCount'
    }
    return null
  },
  check(lines) {
    const issues: TcgIssue[] = []
    const legend = legendOf(lines)
    if (!legend)
      return issues
    const off = lines.filter(l => l.card && l.card.category !== 'Legend' && !inDomains(l.card, legend)).map(l => l.card!.name)
    if (off.length)
      issues.push({ code: 'offDomain', level: 'error', cards: off })
    const chosen = lines.find(l => zoneOf(l.entry, RIFTBOUND_RULES) === 'champion')?.card
    if (chosen && champion(chosen) !== champion(legend))
      issues.push({ code: 'chosenChampion', level: 'error', cards: [chosen.name] })
    const signatures = lines.filter(l => l.card?.subtype === 'Signature')
    const count = signatures.reduce((n, l) => n + l.entry.quantity, 0)
    if (count > 3)
      issues.push({ code: 'signatureCount', level: 'error', count, max: 3 })
    const foreign = signatures.filter(l => champion(l.card) !== champion(legend)).map(l => l.card!.name)
    if (foreign.length)
      issues.push({ code: 'signatureChampion', level: 'error', cards: foreign })
    return issues
  },
}
