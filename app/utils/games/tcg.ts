/**
 * What the generic engine's screens show per game: its categories and
 * filters, its type colours, its rarities, a sample list line. One entry per
 * game (`Record<TcgGameId, …>`: a game added without its entry does not
 * compile). Labels are i18n keys `<game>.<kind>.<value>`; a value without one
 * shows as itself (utils/games/tcg tcgLabel).
 */
import type { TcgCard, TcgGameId } from '#shared/tcg/types'

export interface TcgUi {
  /** Card categories, in filter order. */
  categories: readonly string[]
  /** Subtypes per category, in filter order. */
  subtypes: Readonly<Record<string, readonly string[]>>
  /** The types a card shows (energy, attribute, domain), in filter order. */
  types: readonly string[]
  typeColor: Readonly<Record<string, string>>
  /** Each type's symbol (Iconify name). */
  typeIcon: Readonly<Record<string, string>>
  /** Rarities, strongest first. */
  rarityOrder: readonly string[]
  /** A card without a type counts as this one, if any. */
  colourless: string | null
  /** Card shape: width / height. */
  aspect: number
  /** What the library says of its cards (an i18n key suffix). */
  sampleLine: string
  /** The builder's stats: the stat giving a card's weight, if any (Pokémon HP). */
  stat: string | null
}

export const TCG_UI: Record<TcgGameId, TcgUi> = {
  pokemon: {
    categories: ['Pokemon', 'Trainer', 'Energy'],
    subtypes: {
      Pokemon: ['Basic', 'Stage1', 'Stage2', 'MEGA', 'VMAX', 'VSTAR', 'BREAK', 'LEVEL-UP', 'V-UNION', 'RESTORED', 'Baby'],
      Trainer: ['Item', 'Supporter', 'Stadium', 'Tool', 'Technical Machine'],
      Energy: ['Normal', 'Special'],
    },
    types: ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Fairy', 'Dragon', 'Colorless'],
    typeColor: {
      Grass: '#3f9a45',
      Fire: '#e2502c',
      Water: '#2f84d0',
      Lightning: '#f2c531',
      Psychic: '#9b4fb6',
      Fighting: '#b9632f',
      Darkness: '#2f3a3f',
      Metal: '#8d99a3',
      Fairy: '#e27fb3',
      Dragon: '#b39433',
      Colorless: '#d6d2c4',
    },
    typeIcon: {
      Grass: 'i-lucide-leaf',
      Fire: 'i-lucide-flame',
      Water: 'i-lucide-droplet',
      Lightning: 'i-lucide-zap',
      Psychic: 'i-lucide-eye',
      Fighting: 'i-lucide-hand-fist',
      Darkness: 'i-lucide-moon',
      Metal: 'i-lucide-cog',
      Fairy: 'i-lucide-sparkles',
      Dragon: 'i-lucide-swords',
      Colorless: 'i-lucide-star',
    },
    rarityOrder: [
      'Mega Hyper Rare',
      'Hyper rare',
      'Special illustration rare',
      'Ultra Rare',
      'Illustration rare',
      'ACE SPEC Rare',
      'Shiny Ultra Rare',
      'Shiny rare',
      'Double rare',
      'Radiant Rare',
      'Amazing Rare',
      'Holo Rare',
      'Rare Holo',
      'Rare',
      'Uncommon',
      'Common',
      'None',
    ],
    colourless: 'Colorless',
    aspect: 63 / 88,
    sampleLine: '4 sv03.5-006',
    stat: 'hp',
  },
}

/** A game's value as shown: its i18n label when it has one, itself otherwise. */
export function tcgLabel(t: (key: string) => string, game: TcgGameId, kind: string, value: string | null | undefined): string {
  if (!value)
    return ''
  const key = `${game}.${kind}.${value}`
  const label = t(key)
  return label === key ? value : label
}

/**
 * A deck's cover card: its star. Pokémon: the rule-box Pokémon (ex, V…) it
 * plays most, else its first Pokémon; any game: else the first card.
 */
export function tcgCover<L extends { card: TcgCard | null, entry: { quantity: number } }>(game: TcgGameId, lines: readonly L[]): L | null {
  const known = lines.filter(l => l.card)
  if (game === 'pokemon') {
    const star = (l: L) => l.card!.category === 'Pokemon' && !!l.card!.suffix
    const ranked = [...known].sort((a, b) => Number(star(b)) - Number(star(a)) || Number(b.card!.category === 'Pokemon') - Number(a.card!.category === 'Pokemon') || b.entry.quantity - a.entry.quantity)
    return ranked[0] ?? null
  }
  return known[0] ?? null
}
