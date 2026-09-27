/**
 * Printings by id: `{ lang, ids }` → `{ cards }` in input order, `null` for
 * an unknown id. What a decklist and a card page resolve through.
 */
import type { TcgCard } from '../../../../shared/tcg/types'
import { useTcgDb } from '../../../utils/tcg/db'
import { TCG_ID, tcgGame, tcgLang } from '../../../utils/tcg/params'
import { buildByIdQuery, toTcgCard } from '../../../utils/tcg/query'

const MAX_IDS = 150

export default defineEventHandler(async (event) => {
  const game = tcgGame(event)
  const body = await readBody<{ lang?: unknown, ids?: unknown }>(event)
  const ids = Array.isArray(body?.ids) ? body.ids : null
  if (!ids || ids.length > MAX_IDS || !ids.every(id => typeof id === 'string' && TCG_ID.test(id)))
    throw createError({ statusCode: 400, statusMessage: `ids must be at most ${MAX_IDS} card ids` })
  const unique = [...new Set(ids as string[])]
  const byId = new Map<string, TcgCard>()
  if (unique.length) {
    const { rows } = await useTcgDb(game).execute(buildByIdQuery(unique, tcgLang(body?.lang)))
    for (const r of rows) byId.set(String(r.id), toTcgCard(game, r))
  }
  return { cards: (ids as string[]).map(id => byId.get(id) ?? null) }
})
