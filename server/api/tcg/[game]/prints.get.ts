/**
 * Every printing of a card — the ones the rules count as the same card —
 * for the printing picker. `id` names any one of them, or `name` the card.
 */
import { fold } from '../../../utils/cards/text'
import { useTcgDb } from '../../../utils/tcg/db'
import { TCG_ID, tcgGame, tcgLang } from '../../../utils/tcg/params'
import { buildPrintsQuery, toTcgCard } from '../../../utils/tcg/query'

export default defineEventHandler(async (event) => {
  const game = tcgGame(event)
  const q = getQuery(event)
  const id = typeof q.id === 'string' ? q.id.trim() : ''
  const name = typeof q.name === 'string' ? fold(q.name.slice(0, 120)) : ''
  const db = useTcgDb(game)
  // By a printing's id, or by the card's name (English, as the collection names it).
  let key = name
  if (!key && TCG_ID.test(id)) {
    const { rows: [card] } = await db.execute({ sql: 'SELECT card_key FROM cards WHERE id = ? LIMIT 1', args: [id] })
    key = card ? String(card.card_key) : ''
  }
  if (!key)
    return { prints: [] }
  const { rows } = await db.execute(buildPrintsQuery(key, tcgLang(q.lang)))
  return { prints: rows.map(r => toTcgCard(game, r)) }
})
