import type { CategoryKey, ManaColor } from './useMtg'
import type { ResolvedCard, ScryfallCard } from './useScryfall'
import { canonicalColors, CATEGORY_DEFS, classifyType, englishTypeLine, isCommanderType } from './useMtg'

export interface TypeStat {
  key: CategoryKey
  labelKey: string
  icon: string
  count: number
}

export interface ManaCurve {
  /** Buckets by converted mana cost: index 0..6 = CMC 0..6, index 7 = 7+. */
  buckets: number[]
  max: number
  avg: number
  /** Number of non-land cards counted. */
  spells: number
}

export interface PriceSummary {
  /** Total EUR across resolved cards (×qty). */
  total: number
  /** Cards (×qty) that had no EUR price. */
  missing: number
}

export function useDeckAnalysis() {
  /**
   * Counts by card type, respecting quantities. A card counts once, by its
   *  most "important" type (creature beats land, etc. — see classifyType order).
   */
  function typeStats(cards: ResolvedCard[]): TypeStat[] {
    const counts = new Map<CategoryKey, number>()
    for (const rc of cards) {
      const tl = englishTypeLine(rc.card)
      if (!tl)
        continue
      const key = classifyType(tl)
      counts.set(key, (counts.get(key) ?? 0) + rc.entry.quantity)
    }
    return CATEGORY_DEFS
      .map(d => ({ key: d.key, labelKey: d.labelKey, icon: d.icon, count: counts.get(d.key) ?? 0 }))
      .filter(s => s.count > 0)
  }

  /**
   * Detect the commander: the first resolved card whose type line is a
   *  Legendary Creature (or Planeswalker that can be a commander). Returns its index.
   */
  function detectCommanderIndex(cards: ResolvedCard[]): number {
    return cards.findIndex(rc => isCommanderType(englishTypeLine(rc.card)))
  }

  /** Mana identity (WUBRG) derived from a card's Scryfall color_identity. */
  function commanderColors(card: ScryfallCard | null): ManaColor[] {
    if (!card)
      return []
    return canonicalColors(card.color_identity ?? card.colors)
  }

  /**
   * Mana curve over NON-LAND cards (lands have no meaningful CMC for a curve).
   * Buckets 0..6 then a 7+ bucket. Average is computed over the same set.
   */
  function manaCurve(cards: ResolvedCard[]): ManaCurve {
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0]
    let cmcSum = 0
    let spells = 0
    for (const rc of cards) {
      if (!rc.card || classifyType(englishTypeLine(rc.card)) === 'land')
        continue
      const cmc = Math.max(0, Math.round(rc.card.cmc ?? 0))
      const idx = Math.min(cmc, 7)
      buckets[idx] = (buckets[idx] ?? 0) + rc.entry.quantity
      cmcSum += cmc * rc.entry.quantity
      spells += rc.entry.quantity
    }
    return {
      buckets,
      max: Math.max(1, ...buckets),
      avg: spells ? cmcSum / spells : 0,
      spells,
    }
  }

  /** Total EUR price of the resolved cards (×qty). */
  function priceSummary(cards: ResolvedCard[]): PriceSummary {
    let total = 0
    let missing = 0
    for (const rc of cards) {
      const eur = rc.priceEur ?? rc.card?.prices?.eur
      const n = eur ? Number.parseFloat(eur) : Number.NaN
      if (Number.isFinite(n))
        total += n * rc.entry.quantity
      else missing += rc.entry.quantity
    }
    return { total: Math.round(total * 100) / 100, missing }
  }

  return { typeStats, detectCommanderIndex, commanderColors, manaCurve, priceSummary }
}
