import type { OptcgCategory, OptcgColor } from './rules'

/**
 * A One Piece card as the app sees it: one card number, shown through one
 * printing (an art, in a language). Built by the server from the local
 * database; the client never talks to Bandai.
 */
export interface OptcgCard {
  /** The printing shown: "OP01-016", or "OP01-016_p1" for an alternate art. */
  id: string
  /** Card number shared by every art — what the deck rules count. */
  number: string
  /** Language of the name, text and image: French when Bandai has it. */
  lang: 'fr' | 'en'
  name: string
  category: OptcgCategory
  colors: OptcgColor[]
  rarity: string | null
  /** Leaders have no cost. */
  cost: number | null
  /** Leaders only. */
  life: number | null
  power: number | null
  counter: number | null
  attributes: string[]
  types: string[]
  effect: string | null
  trigger: string | null
  /** Set code as printed ("OP-01"). */
  set: string | null
  /** Highest labelled block icon; null for the newest sets. */
  block: number | null
  banned: boolean
  /** Number of arts for this card number, all languages together. */
  variants: number
  image: string
  /** The same art at grid size (320 px), for lists and posters. */
  thumb: string
}

/** One art of a card number, for the art picker. */
export interface OptcgPrint {
  id: string
  lang: 'fr' | 'en'
  rarity: string | null
  set: string | null
  image: string
  thumb: string
}

export type OptcgSortOrder = 'number' | 'cost' | 'power' | 'name'
