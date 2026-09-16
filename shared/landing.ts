/** What the landing page shows, shared by its server routes and components. */
import type { GameId } from './game'
import type { OptcgCategory, OptcgColor } from './optcg/rules'

/** A Magic card of the landing's art pool. */
export interface LandingCard {
  /** In the site language. */
  name: string
  /** The card's own page. */
  path: string
  image: string
  /** A lighter copy of `image`, for small frames. */
  thumb: string
  art: string
  artist: string
  /** Lower-case WUBRG letters. */
  colors: string[]
}

/** A One Piece card of the landing's art pool. */
export interface LandingPoster {
  number: string
  name: string
  category: OptcgCategory
  colors: OptcgColor[]
  power: number | null
  image: string
  thumb: string
}

/** One card in the landing's search results, whatever the game. */
export interface LandingHit {
  id: string
  name: string
  /** Number (One Piece) or type line (Magic). */
  meta: string
  image: string | null
  path: string
}

export interface LandingSearch {
  optcg: LandingHit[]
  mtg: LandingHit[]
}

export interface LandingDeck {
  name: string
  game: GameId
  owner: string
  updatedAt: number
  path: string
}

export interface LandingOverview {
  stats: {
    /** Card numbers, every art together. */
    optcgCards: number
    /** One Piece images on disk, French and English. */
    optcgArts: number
    /** Magic cards the grimoire shows (legal in Commander). */
    mtgCards: number
    publicDecks: number
  }
  decks: LandingDeck[]
}
