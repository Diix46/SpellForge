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
export type GameId = 'mtg' | 'optcg'

interface GameCardBase {
  game: GameId
  /** Printing id — stable enough to key a rendered list. */
  id: string
  /** Canonical English name: the decklist join key, in every game. */
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
  // Typed once the One Piece adapter lands (lot 6). Declared now on purpose:
  // a single-member union would let code reach `raw` without narrowing.
  raw: unknown
}

export type GameCard = MtgGameCard | OptcgGameCard
