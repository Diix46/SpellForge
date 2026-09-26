/**
 * One Piece sets, for the set filter: code, a readable name, card count.
 * Boosters first (newest first), then extra boosters, premium boosters,
 * starter decks and promos.
 */
import { useOptcgCardsDb } from '../../utils/cards/db'
import { optcgSetName, optcgSetOrder } from '../../utils/collection/sets'

export interface OptcgSet {
  code: string
  name: string
  cards: number
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
    name: optcgSetName(r.title, String(r.code)),
    cards: Number(r.cards),
  }))
  sets.sort((a, b) => optcgSetOrder(a.code, b.code))
  return { sets }
})
