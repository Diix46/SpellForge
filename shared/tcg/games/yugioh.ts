/**
 * Yu-Gi-Oh! TCG deck rules:
 *
 * - Main Deck 40 to 60 cards, Extra Deck 0 to 15, Side Deck 0 to 15;
 * - at most 3 copies of a card by name, the three decks together;
 * - the TCG banlist: Forbidden (none), Limited (1), Semi-Limited (2) — read
 *   from each card (`limit`, `banned`), updated with every ingestion;
 * - Fusion, Synchro, Xyz and Link monsters go in the Extra Deck, never the Main.
 */
import type { TcgRules } from '../deck'

export const YUGIOH_RULES: TcgRules = {
  zones: [
    { id: 'main', min: 40, max: 60 },
    { id: 'extra', min: 0, max: 15 },
    { id: 'side', min: 0, max: 15 },
  ],
  formats: ['tcg'],
  zoneFor: card => (card.extraDeck ? 'extra' : 'main'),
  fits: (card, zone) => zone === 'side' || (zone === 'extra') === card.extraDeck,
  copyLimit: () => 3,
}
