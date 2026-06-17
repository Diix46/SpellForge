import type { ManaColor } from './useManaIdentity'
import type { ResolvedCard, ScryfallCard } from './useScryfall'

export interface TypeStat {
  key: string
  label: string
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

const TYPE_DEFS: Array<{ key: string, label: string, icon: string, match: RegExp }> = [
  { key: 'creature', label: 'Créatures', icon: 'i-lucide-paw-print', match: /creature|créature/i },
  { key: 'instant', label: 'Éphémères', icon: 'i-lucide-zap', match: /instant|éphémère|ephemere/i },
  { key: 'sorcery', label: 'Rituels', icon: 'i-lucide-flame', match: /sorcery|rituel/i },
  { key: 'artifact', label: 'Artefacts', icon: 'i-lucide-cog', match: /artifact|artefact/i },
  { key: 'enchantment', label: 'Enchantements', icon: 'i-lucide-sparkles', match: /enchantment|enchantement/i },
  { key: 'planeswalker', label: 'Planeswalkers', icon: 'i-lucide-user-round', match: /planeswalker/i },
  { key: 'battle', label: 'Batailles', icon: 'i-lucide-swords', match: /battle|bataille/i },
  { key: 'land', label: 'Terrains', icon: 'i-lucide-mountain', match: /land|terrain/i },
]

function typeLineOf(card: ScryfallCard | null): string {
  if (!card)
    return ''
  // Prefer the English type_line (stable), fall back to printed/face.
  return (
    card.type_line
    || card.card_faces?.[0]?.type_line
    || card.printed_type_line
    || card.card_faces?.[0]?.printed_type_line
    || ''
  )
}

// Color letters from a Scryfall color/identity array → our ManaColor type.
function toManaColors(letters: string[] | undefined): ManaColor[] {
  if (!letters?.length)
    return []
  const order: ManaColor[] = ['w', 'u', 'b', 'r', 'g']
  const set = new Set(letters.map(l => l.toLowerCase()))
  return order.filter(c => set.has(c))
}

export function useDeckAnalysis() {
  /**
   * Counts by card type, respecting quantities. A card counts once, by its
   *  most "important" type (lands last so e.g. "Artifact Land" counts as land
   *  only if it has no other classifiable type — handled by ordering).
   */
  function typeStats(cards: ResolvedCard[]): TypeStat[] {
    const counts: Record<string, number> = {}
    for (const def of TYPE_DEFS) counts[def.key] = 0

    for (const rc of cards) {
      const tl = typeLineOf(rc.card)
      if (!tl)
        continue
      const qty = rc.entry.quantity
      // Find the first matching type in TYPE_DEFS order (creature beats land, etc.)
      const def = TYPE_DEFS.find(d => d.match.test(tl))
      if (def)
        counts[def.key] = (counts[def.key] ?? 0) + qty
    }

    return TYPE_DEFS
      .map(d => ({ key: d.key, label: d.label, icon: d.icon, count: counts[d.key] ?? 0 }))
      .filter(s => s.count > 0)
  }

  /**
   * Detect the commander: the first resolved card whose type line is a
   *  Legendary Creature (or Planeswalker that can be a commander). Returns its index.
   */
  function detectCommanderIndex(cards: ResolvedCard[]): number {
    const idx = cards.findIndex((rc) => {
      const tl = typeLineOf(rc.card).toLowerCase()
      return tl.includes('legendary') && (tl.includes('creature') || tl.includes('planeswalker'))
    })
    return idx
  }

  /** Mana identity (WUBRG) derived from a card's Scryfall color_identity. */
  function commanderColors(card: ScryfallCard | null): ManaColor[] {
    if (!card)
      return []
    return toManaColors(card.color_identity ?? card.colors)
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
      const tl = typeLineOf(rc.card).toLowerCase()
      if (!rc.card || tl.includes('land') || tl.includes('terrain'))
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

  return { typeStats, detectCommanderIndex, commanderColors, typeLineOf, manaCurve, priceSummary }
}
