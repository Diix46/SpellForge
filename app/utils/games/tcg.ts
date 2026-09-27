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
  /** The search shows one printing per card: the game reprints a card dozens of times. */
  uniqueSearch: boolean
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
    uniqueSearch: false,
  },
  yugioh: {
    categories: ['Monster', 'Spell', 'Trap'],
    subtypes: {
      Monster: ['Normal', 'Effect', 'Ritual', 'Fusion', 'Synchro', 'Xyz', 'Link'],
      Spell: ['Normal', 'Quick-Play', 'Continuous', 'Equip', 'Field', 'Ritual'],
      Trap: ['Normal', 'Continuous', 'Counter'],
    },
    types: ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'],
    typeColor: {
      DARK: '#5b2d86',
      LIGHT: '#e2b93b',
      EARTH: '#8a5a2b',
      WATER: '#2f7fd0',
      FIRE: '#d9442b',
      WIND: '#3a9a58',
      DIVINE: '#c9a13d',
    },
    typeIcon: {
      DARK: 'i-lucide-moon',
      LIGHT: 'i-lucide-sun',
      EARTH: 'i-lucide-mountain',
      WATER: 'i-lucide-droplet',
      FIRE: 'i-lucide-flame',
      WIND: 'i-lucide-wind',
      DIVINE: 'i-lucide-sparkles',
    },
    rarityOrder: [
      'Quarter Century Secret Rare',
      'Starlight Rare',
      'Ghost Rare',
      'Collector\'s Rare',
      'Platinum Secret Rare',
      'Prismatic Secret Rare',
      'Ultimate Rare',
      'Secret Rare',
      'Gold Rare',
      'Ultra Rare',
      'Super Rare',
      'Rare',
      'Short Print',
      'Common',
    ],
    colourless: null,
    aspect: 59 / 86,
    sampleLine: '3 LOB-EN005',
    stat: 'atk',
    uniqueSearch: true,
  },
  riftbound: {
    categories: ['Legend', 'Unit', 'Spell', 'Gear', 'Rune', 'Battlefield'],
    subtypes: {
      Unit: ['Champion', 'Signature'],
      Spell: ['Signature'],
      Gear: ['Signature'],
      Legend: ['Champion'],
    },
    types: ['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order', 'Colorless'],
    typeColor: {
      Fury: '#d8403a',
      Calm: '#3f9d64',
      Mind: '#3d7fd6',
      Body: '#e08a2c',
      Chaos: '#8e4fc1',
      Order: '#d9b62f',
      Colorless: '#a3a7ab',
    },
    typeIcon: {
      Fury: 'i-lucide-flame',
      Calm: 'i-lucide-leaf',
      Mind: 'i-lucide-brain',
      Body: 'i-lucide-dumbbell',
      Chaos: 'i-lucide-tornado',
      Order: 'i-lucide-shield',
      Colorless: 'i-lucide-circle',
    },
    rarityOrder: ['Showcase', 'Epic', 'Rare', 'Uncommon', 'Common', 'Promo'],
    colourless: 'Colorless',
    aspect: 744 / 1039,
    sampleLine: '3 ogn-001-298',
    stat: 'might',
    uniqueSearch: false,
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
 * plays most, else its first Pokémon; Riftbound: the Legend; any game: else
 * the first card.
 */
export function tcgCover<L extends { card: TcgCard | null, entry: { quantity: number } }>(game: TcgGameId, lines: readonly L[]): L | null {
  const known = lines.filter(l => l.card)
  // Riftbound: the Legend leads the deck.
  if (game === 'riftbound')
    return known.find(l => l.card!.category === 'Legend') ?? known[0] ?? null
  if (game === 'pokemon') {
    const star = (l: L) => l.card!.category === 'Pokemon' && !!l.card!.suffix
    const ranked = [...known].sort((a, b) => Number(star(b)) - Number(star(a)) || Number(b.card!.category === 'Pokemon') - Number(a.card!.category === 'Pokemon') || b.entry.quantity - a.entry.quantity)
    return ranked[0] ?? null
  }
  return known[0] ?? null
}

// Collectors' abbreviations of the rarities that share initials.
const RARITY_SHORT: Record<string, string> = {
  'Super Rare': 'SR',
  'Secret Rare': 'ScR',
  'Starlight Rare': 'StR',
  'Ultra Rare': 'UR',
  'Ultimate Rare': 'UtR',
  'Prismatic Secret Rare': 'PScR',
  'Platinum Secret Rare': 'PlScR',
  'Quarter Century Secret Rare': 'QCScR',
  'Collector\'s Rare': 'CR',
  'Grand Master Rare': 'GMR',
  'Ghost Rare': 'GR',
  'Gold Rare': 'GoR',
  'Short Print': 'SP',
}

/** A rarity in a few letters, for a badge: its collectors' short name, else its initials. */
export function rarityShort(rarity: string | null | undefined): string {
  if (!rarity)
    return '?'
  return RARITY_SHORT[rarity] ?? rarity.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('')
}
