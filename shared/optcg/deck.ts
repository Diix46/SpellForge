/**
 * One Piece deckbuilding logic on resolved cards: what may be added, and the
 * numbers the builder shows. Pure, like the rules it builds on.
 */
import type { DeckEntry } from '../decklist'
import type { OptcgRuleCard, OptcgValidation } from './rules'
import type { OptcgCard } from './types'
import { MAX_COPIES, validateOptcgDeck } from './rules'

export function toRuleCard(card: OptcgCard): OptcgRuleCard {
  return { number: card.number, category: card.category, colors: card.colors, block: card.block, banned: card.banned }
}

/** A decklist entry with the card it resolved to (null while unknown). */
export interface OptcgDeckLine {
  entry: DeckEntry
  card: OptcgCard | null
}

/** The Leader of a deck: the first entry that resolved to a Leader. */
export function findLeader(lines: readonly OptcgDeckLine[]): OptcgDeckLine | null {
  return lines.find(l => l.card?.category === 'Leader') ?? null
}

/** Copies of a card number in the deck, alternate arts together. */
export function copiesOf(lines: readonly OptcgDeckLine[], number: string): number {
  return lines.reduce((n, l) => n + (l.entry.name === number ? l.entry.quantity : 0), 0)
}

export type AddVerdict
  = | { ok: true, asLeader: boolean }
    | { ok: false, reason: 'maxCopies' | 'offColor' | 'banned' }

/**
 * Whether a card can go into the deck right now. A Leader always can: it takes
 * the Leader slot. Rotation is not checked here — the player may be building
 * for an older format — but it shows in the validation.
 */
export function canAdd(lines: readonly OptcgDeckLine[], card: OptcgCard): AddVerdict {
  if (card.category === 'Leader')
    return { ok: true, asLeader: true }
  if (card.banned)
    return { ok: false, reason: 'banned' }
  if (copiesOf(lines, card.number) >= MAX_COPIES)
    return { ok: false, reason: 'maxCopies' }
  const leader = findLeader(lines)?.card
  if (leader && !card.colors.every(c => leader.colors.includes(c)))
    return { ok: false, reason: 'offColor' }
  return { ok: true, asLeader: false }
}

/** The rules engine, fed from resolved lines. Unresolved lines are left out. */
export function validateLines(lines: readonly OptcgDeckLine[]): OptcgValidation {
  const leader = findLeader(lines)
  const rest = lines.filter(l => l !== leader && l.card)
  return validateOptcgDeck(
    leader?.card ? toRuleCard(leader.card) : null,
    rest.map(l => ({ card: toRuleCard(l.card!), quantity: l.entry.quantity })),
  )
}

export interface OptcgDeckStats {
  /** Cards outside the Leader slot. */
  count: number
  byCategory: Record<'Character' | 'Event' | 'Stage', number>
  /** Copies per cost, 0 to 10; the last bucket holds 10 and above. */
  curve: number[]
  /** Copies per counter value: none, +1000, +2000. */
  counters: { none: number, c1000: number, c2000: number }
  /** Characters and Stages carrying a [Trigger]. */
  triggers: number
  averageCost: number | null
}

export function deckStats(lines: readonly OptcgDeckLine[]): OptcgDeckStats {
  const leader = findLeader(lines)
  const stats: OptcgDeckStats = {
    count: 0,
    byCategory: { Character: 0, Event: 0, Stage: 0 },
    curve: Array.from<number>({ length: 11 }).fill(0),
    counters: { none: 0, c1000: 0, c2000: 0 },
    triggers: 0,
    averageCost: null,
  }
  let costSum = 0
  let costed = 0
  for (const line of lines) {
    const { card, entry } = line
    if (line === leader || !card || card.category === 'Leader')
      continue
    const n = entry.quantity
    stats.count += n
    stats.byCategory[card.category] += n
    if (card.cost != null) {
      stats.curve[Math.min(card.cost, 10)]! += n
      costSum += card.cost * n
      costed += n
    }
    if (card.category === 'Character') {
      if (card.counter === 2000)
        stats.counters.c2000 += n
      else if (card.counter === 1000)
        stats.counters.c1000 += n
      else stats.counters.none += n
    }
    if (card.trigger)
      stats.triggers += n
  }
  stats.averageCost = costed ? Math.round((costSum / costed) * 10) / 10 : null
  return stats
}
