import type { DeckEntry } from '#shared/decklist'
import { totalCards } from '#shared/decklist'
import { parseMtgDecklist } from '#shared/mtg/decklist'

export type { DeckEntry, ParseResult } from '#shared/decklist'

/**
 * Magic decklist parsing. The format itself lives in shared/mtg/decklist.ts,
 * where it is pure and tested; this keeps the composable callers already use.
 */
export function useDecklist() {
  return {
    parse: parseMtgDecklist,
    totalCards: (entries: DeckEntry[]) => totalCards(entries),
  }
}
