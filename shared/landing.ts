/** What the landing page shows, shared by its server routes and components. */
import type { GameId } from './game'

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
