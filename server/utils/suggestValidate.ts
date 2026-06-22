// Anti-hallucination validation gate for the AI deck-suggestions route. The
// model proposes ADD/CUT card names; these helpers ensure the UI only ever sees
// cards the player can actually use. Each rule is a small, independently testable
// function; suggest.post.ts composes them so its handler stays a linear
// parse → AI → validate → return flow. Auto-imported by Nitro (server/utils).

export interface Suggestion { name: string, reason: string }
export interface ScryCard { name?: string, color_identity?: string[], legalities?: Record<string, string> }

/** A card is in-identity when every colour of its identity is in the allowed set. */
export function inIdentity(card: ScryCard, allowed: Set<string>): boolean {
  const id = card.color_identity ?? []
  return id.every(c => allowed.has(c.toLowerCase()))
}

export function legalInCommander(card: ScryCard): boolean {
  // Be permissive if Scryfall didn't return legalities; only drop on explicit non-legal.
  const l = card.legalities?.commander
  return l !== 'not_legal' && l !== 'banned'
}

/** CUTs must name a card already in the decklist (verbatim, case-insensitive). */
export function filterValidCuts(rawCut: Suggestion[], inDeck: Set<string>): { cut: Suggestion[], dropped: number } {
  const cut = rawCut.filter(s => inDeck.has(s.name.trim().toLowerCase()))
  return { cut, dropped: rawCut.length - cut.length }
}

/**
 * ADDs must resolve to a real Scryfall card, sit within the commander's colour
 * identity, be Commander-legal, not already be in the deck, and be unique. Each
 * proposal that fails any rule is dropped and counted, so `dropped` reflects the
 * full gap between what the model proposed and what the UI shows.
 */
export async function validateAdds(
  rawAdd: Suggestion[],
  allowed: Set<string>,
  inDeck: Set<string>,
): Promise<{ add: Suggestion[], dropped: number }> {
  if (!rawAdd.length)
    return { add: [], dropped: 0 }

  const resolved = await resolveScryfallByName<ScryCard>(rawAdd.map(s => s.name))
  const add: Suggestion[] = []
  let dropped = 0
  const seen = new Set<string>()

  for (const s of rawAdd) {
    const card = resolved.get(s.name.trim().toLowerCase())
    const ok = card
      && (allowed.size === 0 || inIdentity(card, allowed))
      && legalInCommander(card)
      && !inDeck.has(s.name.trim().toLowerCase())
    if (!ok) {
      dropped++
      continue
    }
    // De-dupe by canonical name (the model can repeat); repeats count as dropped.
    const canonical = card!.name ?? s.name
    const key = canonical.toLowerCase()
    if (seen.has(key)) {
      dropped++
      continue
    }
    seen.add(key)
    add.push({ name: canonical, reason: s.reason })
  }

  return { add, dropped }
}
