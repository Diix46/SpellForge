/**
 * Structured card search, served from the local database.
 *
 * Replaces the Scryfall search proxy for the builder's search panel. The client
 * sends the same filters it already had instead of compiling them into Scryfall
 * syntax, and gets back the same response shape, so the panel is unchanged.
 *
 * Text typed in Scryfall syntax arrives as `text` like any other search and is
 * compiled here; syntax we cannot honour is a 400 naming the offending term.
 */
import { parseBrowseQuery } from '../../utils/cards/browse-params'
import { useMtgCardsDb } from '../../utils/cards/db'
import { buildCardQuery, PAGE_SIZE } from '../../utils/cards/mtg-query'
import { toScryfallShape } from '../../utils/cards/mtg-shape'
import { QuerySyntaxError } from '../../utils/cards/mtg-syntax'

function build(...params: Parameters<typeof buildCardQuery>) {
  try {
    return buildCardQuery(...params)
  }
  catch (err) {
    // A query we refuse to run is the user's to fix: say which part, as a code
    // the client translates, rather than failing as a server error.
    if (err instanceof QuerySyntaxError)
      throw createError({ statusCode: 400, statusMessage: 'Invalid search syntax', data: { code: err.code, term: err.term } })
    throw err
  }
}

export default defineEventHandler(async (event) => {
  const { filters, ctx, order, page } = parseBrowseQuery(getQuery(event))
  const db = useMtgCardsDb()
  const q = build(filters, ctx, order, page)

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
