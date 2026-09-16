import type { GameCard, MtgGameCard } from '../../types/cards'
import type { ScryfallCard } from './types'
import { englishTypeLine } from '../useMtg'

/**
 * Wrap a Scryfall card in the game-neutral model.
 *
 * `typeLine` reuses `englishTypeLine` rather than reading `type_line`, so card
 * classification stays exactly what it was: the same fallback to the front face,
 * then to the printed type line, for any card object missing the field. Real
 * double-faced cards do carry a combined top-level line
 * ("Creature — Human Wizard // Creature — Human Insect"); the fallback covers
 * partial objects, not them.
 */
export function toMtgCard(card: ScryfallCard): MtgGameCard {
  return {
    game: 'mtg',
    id: card.id,
    key: card.name,
    name: card.name,
    cmc: card.cmc ?? null,
    colorIdentity: card.color_identity ?? [],
    typeLine: englishTypeLine(card),
    raw: card,
  }
}

/**
 * The Scryfall payload of a card, or null when the card is not Magic.
 *
 * Magic-only helpers (display name, faces, image URIs) still take Scryfall's
 * shape. Routing them through here makes every such call site state its Magic
 * assumption out loud, instead of letting it pass unnoticed.
 */
export function mtgRaw(card: GameCard | null | undefined): ScryfallCard | null {
  return card?.game === 'mtg' ? card.raw : null
}
