/**
 * One Piece sets, for the set filter: code, a readable name, card count.
 * Boosters first (newest first), then extra boosters, premium boosters,
 * starter decks and promos.
 */
import { useOptcgCardsDb } from '../../utils/cards/db'

export interface OptcgSet {
  code: string
  name: string
  cards: number
}

const KIND_ORDER = ['OP', 'EB', 'PRB', 'ST', 'P']

/** "BOOSTER PACK -ROMANCE DAWN- [OP-01]" → "ROMANCE DAWN". */
function shortName(title: unknown, code: string): string {
  const m = typeof title === 'string' ? /-(.+)-\s*\[/.exec(title) : null
  return m?.[1]?.trim() || code
}

function sortKey(code: string): [number, number] {
  const [kind = '', num = '0'] = code.split('-')
  const rank = KIND_ORDER.indexOf(kind)
  return [rank === -1 ? KIND_ORDER.length : rank, -Number(num)]
}

export default defineEventHandler(async (event) => {
  const lang = getQuery(event).lang === 'fr' ? 'fr' : 'en'
  const { rows } = await useOptcgCardsDb().execute({
    sql: `SELECT n.set_code AS code, COUNT(*) AS cards,
                 (SELECT p.title FROM op_packs p WHERE p.label = n.set_code
                   ORDER BY (p.lang = ?) DESC LIMIT 1) AS title
            FROM op_numbers n
           WHERE n.set_code IS NOT NULL
           GROUP BY n.set_code`,
    args: [lang],
  })
  const sets: OptcgSet[] = rows.map(r => ({
    code: String(r.code),
    name: shortName(r.title, String(r.code)),
    cards: Number(r.cards),
  }))
  sets.sort((a, b) => {
    const [ka, na] = sortKey(a.code)
    const [kb, nb] = sortKey(b.code)
    return ka - kb || na - nb
  })
  return { sets }
})
