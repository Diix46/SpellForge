import type { TcgLine } from './deck'
import type { TcgGameId } from './types'

/**
 * A generic-engine deck in numbers, as the One Piece and Magic builders show
 * theirs: the curve of what a card costs (Riftbound's energy, Yu-Gi-Oh!'s
 * Level or Rank; Pokémon has none), the copies per category, and what the
 * deck costs at today's prices.
 */
export interface TcgDeckStats {
  count: number
  /** Copies per cost, 0 to 10 (10: 10 and more); empty for a game without costs. */
  curve: number[]
  /** Mean cost over the copies that have one. */
  averageCost: number | null
  /** Copies per category, in the order met. */
  byCategory: [string, number][]
  /** Euros, the copies with a price. */
  price: number
  /** Copies without a price. */
  unpriced: number
}

/** The stat a game's cards cost, when it has one. */
const COST: Partial<Record<TcgGameId, string[]>> = {
  riftbound: ['energy'],
  yugioh: ['level', 'rank', 'link'],
}

export function tcgDeckStats(game: TcgGameId, lines: readonly TcgLine[]): TcgDeckStats {
  const keys = COST[game]
  const curve: number[] = keys ? Array.from<number>({ length: 11 }).fill(0) : []
  const byCategory = new Map<string, number>()
  let count = 0
  let costSum = 0
  let costed = 0
  let price = 0
  let unpriced = 0
  for (const { entry, card } of lines) {
    const n = entry.quantity
    count += n
    if (!card)
      continue
    byCategory.set(card.category, (byCategory.get(card.category) ?? 0) + n)
    if (card.price != null)
      price += card.price * n
    else
      unpriced += n
    if (keys) {
      const raw = keys.map(k => card.stats[k]).find(v => v != null && v !== '')
      const cost = raw == null ? null : Number(raw)
      if (cost != null && Number.isFinite(cost)) {
        const slot = Math.min(10, Math.max(0, Math.round(cost)))
        curve[slot] = (curve[slot] ?? 0) + n
        costSum += cost * n
        costed += n
      }
    }
  }
  return {
    count,
    curve,
    averageCost: costed ? Math.round((costSum / costed) * 10) / 10 : null,
    byCategory: [...byCategory.entries()],
    price: Math.round(price * 100) / 100,
    unpriced,
  }
}
