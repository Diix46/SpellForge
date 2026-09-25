/**
 * One Piece decklist text, as simulators and deck sites export it:
 *
 *   1xOP01-001
 *   4xOP01-016
 *   4 OP01-016_p1 Nami
 *
 * A quantity, an "x" or a space, a card number with an optional art suffix
 * ("_p1") or reprint suffix ("_r1"), and anything after it — usually the card
 * name — ignored. The Leader is not marked: it is the entry whose card is a
 * Leader, written first by convention. Card numbers are the join key, names
 * being translated and shared by many cards.
 */
import type { DeckEntry, ParseResult } from '../decklist'

// Quantity, separator, number, optional suffix, optional trailing text. Each
// part is anchored on a character class the next one cannot start with, so the
// match stays linear.
const LINE = /^(\d{1,2})(?:\s*[x×]\s*|\s+)([A-Z]{1,3}\d{0,2}-\d{3})(_[pr]\d{1,2})?(?:\s.*)?$/i
const COMMENT = /^(?:#|\/\/)/

export function parseOptcgDecklist(raw: string): ParseResult {
  const mainboard: DeckEntry[] = []
  const errors: string[] = []
  for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (COMMENT.test(line))
      continue
    const m = LINE.exec(line)
    if (!m) {
      errors.push(line)
      continue
    }
    const name = m[2]!.toUpperCase()
    const suffix = m[3]?.toLowerCase()
    const entry: DeckEntry = { quantity: Number(m[1]), name }
    // A reprint is the same card for every rule; only an alternate art is a
    // choice worth keeping.
    if (suffix?.startsWith('_p'))
      entry.art = `${name}${suffix}`
    mainboard.push(entry)
  }
  // One Piece has no sideboard in constructed play.
  return { mainboard, sideboard: [], errors }
}

export function optcgLine(entry: DeckEntry): string {
  return `${entry.quantity}x${entry.art ?? entry.name}`
}

/**
 * The deck in simulator order: the Leader first, then the rest as entered.
 * `isLeader` answers from the resolved cards; unknown numbers stay in place.
 */
export function orderOptcgEntries(entries: readonly DeckEntry[], isLeader: (number: string) => boolean): DeckEntry[] {
  const leaders = entries.filter(e => isLeader(e.name))
  return [...leaders, ...entries.filter(e => !leaders.includes(e))]
}
