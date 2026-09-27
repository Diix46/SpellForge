import { useTcgDb } from '../../../utils/tcg/db'
/**
 * A generic-engine game's card search, from its local database.
 */
import { parseTcgBrowse, tcgGame } from '../../../utils/tcg/params'
import { buildBrowseQuery, TCG_PAGE_SIZE, toTcgCard } from '../../../utils/tcg/query'

export default defineEventHandler(async (event) => {
  const game = tcgGame(event)
  const { filters, lang, order, page } = parseTcgBrowse(getQuery(event))
  const db = useTcgDb(game)
  const q = buildBrowseQuery(filters, lang, order, page)
  const [result, count] = await Promise.all([
    db.execute({ sql: q.sql, args: q.args }),
    db.execute({ sql: q.countSql, args: q.countArgs }),
  ])
  const total = Number(count.rows[0]?.total ?? 0)
  return { total, hasMore: page * TCG_PAGE_SIZE < total, cards: result.rows.map(r => toTcgCard(game, r)) }
})
