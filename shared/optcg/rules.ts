/**
 * One Piece Card Game deck rules — Comprehensive Rules v1.2.1 §5-1, Bandai's
 * ban list of 2026-04-10 and the block rotation in force since April 2026.
 *
 * Pure and dependency-free: the deckbuilder runs it on every edit, the server
 * can run it before publishing, and the tests run it without Nuxt.
 *
 * A deck is one Leader, exactly 50 other cards and a DON!! deck of 10 that is
 * never listed. Every rule below reports issues rather than throwing, so the
 * builder can show all of them at once while the player is still building.
 */

export const OPTCG_COLORS = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'] as const
export type OptcgColor = typeof OPTCG_COLORS[number]
export type OptcgCategory = 'Leader' | 'Character' | 'Event' | 'Stage'

export const DECK_SIZE = 50
export const MAX_COPIES = 4
export const DON_DECK_SIZE = 10

/**
 * Standard rotation: cards whose newest printing carries block icon 1 left the
 * format in April 2026. A reprint with a newer icon brings the card back, so
 * the highest labelled icon decides. The data has no block yet for the newest
 * sets, and a card too new to be labelled is by definition not rotated, so
 * unknown counts as legal.
 */
export const MIN_LEGAL_BLOCK = 2

/**
 * Pairs that may not share a deck. Neither card is banned on its own, so the
 * validator cannot be a simple per-card lookup. A Leader counts as part of the
 * deck here: OP11-040 is one.
 */
export const BANNED_PAIRS: readonly (readonly [string, string])[] = [
  ['EB04-058', 'OP07-115'],
  ['OP11-040', 'OP11-067'],
  ['OP11-040', 'OP08-069'],
]

/** What the rules need to know about a card: one entry per card number. */
export interface OptcgRuleCard {
  /** Card number, shared by every alternate art ("OP01-016"). */
  number: string
  category: OptcgCategory
  colors: OptcgColor[]
  /** Highest block icon among its labelled printings; null while none is labelled. */
  block: number | null
  banned: boolean
}

export interface OptcgDeckEntry {
  card: OptcgRuleCard
  quantity: number
}

export type OptcgIssue
  = | { code: 'noLeader' }
    | { code: 'notALeader', number: string }
    | { code: 'leaderCount', number: string, count: number }
    | { code: 'leaderInDeck', number: string }
    | { code: 'deckSize', count: number, expected: number }
    | { code: 'tooManyCopies', number: string, count: number, max: number }
    | { code: 'offColor', number: string, colors: OptcgColor[] }
    | { code: 'banned', number: string }
    | { code: 'rotated', number: string, block: number }
    | { code: 'bannedPair', numbers: [string, string] }

export interface OptcgValidation {
  legal: boolean
  /** Cards in the deck, the Leader excluded. */
  count: number
  issues: OptcgIssue[]
}

/**
 * Validate a deck. Entries may repeat a card number (two alternate arts of the
 * same card): copies are counted per number, as the rules require.
 */
export function validateOptcgDeck(leader: OptcgRuleCard | null, entries: readonly OptcgDeckEntry[], leaderCopies = 1): OptcgValidation {
  const issues: OptcgIssue[] = []

  if (!leader)
    issues.push({ code: 'noLeader' })
  else if (leader.category !== 'Leader')
    issues.push({ code: 'notALeader', number: leader.number })
  // The Leader area holds one card.
  else if (leaderCopies !== 1)
    issues.push({ code: 'leaderCount', number: leader.number, count: leaderCopies })

  const copies = new Map<string, number>()
  const cards = new Map<string, OptcgRuleCard>()
  let count = 0
  for (const { card, quantity } of entries) {
    if (quantity <= 0)
      continue
    count += quantity
    copies.set(card.number, (copies.get(card.number) ?? 0) + quantity)
    cards.set(card.number, card)
  }

  if (count !== DECK_SIZE)
    issues.push({ code: 'deckSize', count, expected: DECK_SIZE })

  const leaderColors = new Set(leader?.category === 'Leader' ? leader.colors : [])
  for (const [number, card] of cards) {
    const n = copies.get(number)!
    // A second Leader belongs in no deck: only one sits in the Leader area.
    if (card.category === 'Leader') {
      issues.push({ code: 'leaderInDeck', number })
      continue
    }
    if (n > MAX_COPIES)
      issues.push({ code: 'tooManyCopies', number, count: n, max: MAX_COPIES })
    // Every colour of a multicolour card must be one of the Leader's.
    if (leaderColors.size && !card.colors.every(c => leaderColors.has(c)))
      issues.push({ code: 'offColor', number, colors: card.colors })
  }

  for (const card of [...(leader ? [leader] : []), ...cards.values()]) {
    if (card.banned)
      issues.push({ code: 'banned', number: card.number })
    else if (card.block !== null && card.block < MIN_LEGAL_BLOCK)
      issues.push({ code: 'rotated', number: card.number, block: card.block })
  }

  const present = new Set([...cards.keys(), ...(leader ? [leader.number] : [])])
  for (const [a, b] of BANNED_PAIRS) {
    if (present.has(a) && present.has(b))
      issues.push({ code: 'bannedPair', numbers: [a, b] })
  }

  return { legal: issues.length === 0, count, issues }
}

/** Colour bits, in the order the card database stores them. */
export const OPTCG_COLOR_BIT: Record<OptcgColor, number> = { Red: 1, Green: 2, Blue: 4, Purple: 8, Black: 16, Yellow: 32 }
