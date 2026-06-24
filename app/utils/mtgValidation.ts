// Pure MTG deck-construction rules, shared across the client. Kept framework-free
// (no Vue/Nuxt imports) so they're trivially unit-testable and reusable.

/**
 * Is a card legal under a commander's colour identity? A card is within identity
 * when every colour in its `color_identity` is among the `allowed` colours.
 *
 * `allowed` is expected to already be lowercased WUBRG letters (the caller owns
 * the commander's identity and normalises it once); the card's own colours are
 * lowercased here before comparison.
 */
export function isCardWithinIdentity(card: { color_identity?: string[] }, allowed: string[]): boolean {
  return (card.color_identity ?? []).every(c => allowed.includes(c.toLowerCase()))
}
