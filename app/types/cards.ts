import type { GameId } from '#shared/game'
import type { OptcgCard } from '#shared/optcg/types'
import type { ScryfallCard } from '../composables/scryfall/types'

/**
 * Game-neutral card model.
 *
 * The app used to pass Scryfall's raw JSON around as its card type, which made
 * every consumer — deck analysis, the deck page, the detail modal — quietly
 * Magic-specific. Adding a second game meant touching all of them.
 *
 * The base keeps only the fields the app reads regardless of game. Each
 * provider's own payload sits behind the `game` discriminant, so Magic-only code
 * must narrow before it can reach Scryfall's shape — the compiler now says where
 * the Magic assumptions live instead of letting them spread.
 */
interface GameCardBase {
  game: GameId
  /** Printing id — stable enough to key a rendered list. */
  id: string
  /**
   * The decklist join key: the canonical English name for Magic, the card
   * number for One Piece, whose names are translated and shared by many cards.
   */
  key: string
  /** Reference name: English for Magic, the printing's language for One Piece. */
  name: string
  /** Mana value (Magic) or cost (One Piece). */
  cmc: number | null
  /** Colours that constrain deck legality: Magic's identity, One Piece's colours. */
  colorIdentity: string[]
  /** English type line, used to classify cards. Never localised. */
  typeLine: string
}

export interface MtgGameCard extends GameCardBase {
  game: 'mtg'
  raw: ScryfallCard
}

export interface OptcgGameCard extends GameCardBase {
  game: 'optcg'
  raw: OptcgCard
}

export type GameCard = MtgGameCard | OptcgGameCard
