/**
 * Structured card search, served from the local database.
 *
 * Replaces the Scryfall search proxy for the builder's search panel. The client
 * sends the same filters it already had instead of compiling them into Scryfall
 * syntax, and gets back the same response shape, so the panel is unchanged.
 */
import { parseBrowseQuery } from '../../utils/cards/browse-params'
import { useMtgCardsDb } from '../../utils/cards/db'
import { buildCardQuery, PAGE_SIZE } from '../../utils/cards/mtg-query'
import { toScryfallShape } from '../../utils/cards/mtg-shape'

export default defineEventHandler(async (event) => {
  const { filters, ctx, order, page } = parseBrowseQuery(getQuery(event))
  const db = useMtgCardsDb()
  const q = buildCardQuery(filters, ctx, order, page)

  const [result, count] = await Promise.all([
    db.execute({ sql: q.sql, args: q.args }),
    db.execute({ sql: q.countSql, args: q.countArgs }),
  ])
  const total = Number(count.rows[0]?.total ?? 0)

  return {
    total,
    hasMore: page * PAGE_SIZE < total,
    cards: await toScryfallShape(db, result.rows),
  }
})
