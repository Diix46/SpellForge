/**
 * Reads the deck out of an EDHREC page payload (average deck or deck preview).
 *
 * Since 2026 both pages carry `deck: { commander_v2: [[name, qty]], cards:
 * { Type: [[name, qty]] } }`. Older payloads had `deck: ["1 Name", …]` (average)
 * or `cards: [name]` + `commanders: [name]` (preview); they are still read, so
 * a cached or rolled-back response keeps working. Pure, for the tests.
 */

export interface EdhrecDeck {
  commanders: string[]
  /** Decklist lines, commanders first: "1 Sol Ring". */
  lines: string[]
  cardCount: number
}

type Pair = [string, number]

function pairs(value: unknown): Pair[] {
  if (!Array.isArray(value))
    return []
  return value.flatMap((item): Pair[] => {
    if (Array.isArray(item) && typeof item[0] === 'string') {
      const qty = Number(item[1])
      return [[item[0], Number.isInteger(qty) && qty > 0 ? qty : 1]]
    }
    if (typeof item === 'string')
      return [[item, 1]]
    return []
  })
}

/** "4 Name" → ["Name", 4]; a bare name counts once. */
function fromLine(line: string): Pair {
  const m = /^(\d+)\s+(\S.*)$/.exec(line.trim())
  return m ? [m[2]!, Number(m[1])] : [line.trim(), 1]
}

export function readEdhrecDeck(data: unknown): EdhrecDeck | null {
  const page = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const deck = page.deck

  let commanders: Pair[] = []
  let cards: Pair[] = []

  if (deck && typeof deck === 'object' && !Array.isArray(deck)) {
    const d = deck as Record<string, unknown>
    commanders = pairs(d.commander_v2).length ? pairs(d.commander_v2) : pairs(d.commander)
    const byType = d.cards && typeof d.cards === 'object' ? Object.values(d.cards as Record<string, unknown>) : []
    cards = byType.flatMap(pairs)
  }
  else if (Array.isArray(deck)) {
    cards = deck.filter((l): l is string => typeof l === 'string' && l.trim() !== '').map(fromLine)
  }
  else {
    commanders = pairs(page.commanders).slice(0, 2)
    cards = pairs(page.cards)
  }

  const names = new Set(commanders.map(([n]) => n))
  const body = cards.filter(([n]) => !names.has(n))
  const all = [...commanders, ...body]
  if (!all.length)
    return null
  return {
    commanders: commanders.map(([n]) => n),
    lines: all.map(([n, q]) => `${q} ${n}`),
    cardCount: all.reduce((sum, [, q]) => sum + q, 0),
  }
}
