/**
 * The games built on the generic card engine: one database per game in the
 * same shape (scripts/tcg/schema.mjs), read by server/utils/tcg, shown by
 * components/tcg. Magic and One Piece keep their own engines.
 */

export const TCG_GAME_IDS = ['pokemon', 'yugioh', 'riftbound'] as const
export type TcgGameId = typeof TCG_GAME_IDS[number]

export function isTcgGame(game: unknown): game is TcgGameId {
  return typeof game === 'string' && (TCG_GAME_IDS as readonly string[]).includes(game)
}

/** Finish bits, as the databases store them. */
export const FINISH_BIT = { normal: 1, holo: 2, reverse: 4, firstEdition: 8 } as const
export type TcgFinish = keyof typeof FINISH_BIT

/** A Pokémon attack, an ability: shown on the card's sheet. */
export interface TcgAttack { name: string, cost: string[], damage: string | number | null, effect: string | null }
export interface TcgAbility { name: string, type: string | null, effect: string | null }

/**
 * A card as the app sees it: one printing (a card in a set, in a language).
 * `key` groups the printings the rules count as one card.
 */
export interface TcgCard {
  /** The printing: "sv03.5-006". */
  id: string
  lang: 'fr' | 'en'
  key: string
  name: string
  /** Its English name when shown in another language. */
  nameEn: string | null
  /** Number within its set, as printed. */
  number: string
  set: string
  setName: string | null
  /** In English, the same in every language (the client translates it). */
  rarity: string | null
  category: string
  subtype: string | null
  types: string[]
  stats: Record<string, number | string>
  text: string | null
  image: string
  thumb: string
  finishes: TcgFinish[]
  price: number | null
  priceFoil: number | null
  regulation: string | null
  /** Formats it may be played in. */
  legal: string[]
  banned: boolean
  illustrator: string | null
  attacks: TcgAttack[]
  abilities: TcgAbility[]
  weaknesses: { type: string, value: string }[]
  resistances: { type: string, value: string }[]
  /** Evolves from this Pokémon (its name in the card's language). */
  evolveFrom: string | null
  /** "ex", "V"…: what the rules read on some cards. */
  suffix: string | null
  /** The game's own code for the card (Yu-Gi-Oh: its passcode). */
  code: string | null
  /** Copies allowed by the banlist when fewer than the rules' (Yu-Gi-Oh: 0, 1 or 2). */
  limit: number | null
  /** Yu-Gi-Oh: monster type ("Spellcaster"), archetype, Link arrows, Extra Deck monster. */
  race: string | null
  archetype: string | null
  linkMarkers: string[]
  extraDeck: boolean
  /** Riftbound: champion and region tags ("Vi", "Piltover"), a landscape card (Battlefield), a signature card. */
  tags: string[]
  landscape: boolean
  flavour: string | null
}

export interface TcgSet {
  code: string
  name: string
  series: string | null
  released: string | null
  total: number
  symbol: string | null
  logo: string | null
}

export type TcgSortOrder = 'recent' | 'name' | 'number' | 'price'

export interface TcgBrowseResponse { total: number, hasMore: boolean, cards: TcgCard[] }
