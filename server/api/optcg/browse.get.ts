/**
 * One Piece card search, served from the local database.
 */
import { useOptcgCardsDb } from '../../utils/cards/db'
import { parseOptcgBrowseQuery } from '../../utils/cards/optcg-params'
import { buildOptcgBrowseQuery, OPTCG_PAGE_SIZE } from '../../utils/cards/optcg-query'
import { toOptcgCard } from '../../utils/cards/optcg-shape'

export default defineEventHandler(async (event) => {
  const { filters, lang, order, page } = parseOptcgBrowseQuery(getQuery(event))
  const db = useOptcgCardsDb()
  const q = buildOptcgBrowseQuery(filters, lang, order, page)

  const [result, count] = await Promise.all([
    db.execute({ sql: q.sql, args: q.args }),
    db.execute({ sql: q.countSql, args: q.countArgs }),
  ])
  const total = Number(count.rows[0]?.total ?? 0)

  return {
    total,
    hasMore: page * OPTCG_PAGE_SIZE < total,
    cards: result.rows.map(toOptcgCard),
  }
})
