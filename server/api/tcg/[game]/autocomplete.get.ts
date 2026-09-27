import { useTcgDb } from '../../../utils/tcg/db'
/**
 * Card names as the player types, either language: one printing per name.
 */
import { tcgGame, tcgLang } from '../../../utils/tcg/params'
import { buildAutocompleteQuery, toTcgCard } from '../../../utils/tcg/query'

export default defineEventHandler(async (event) => {
  const game = tcgGame(event)
  const q = getQuery(event)
  const text = typeof q.q === 'string' ? q.q.trim().slice(0, 60) : ''
  if (text.length < 2)
    return { cards: [] }
  const { rows } = await useTcgDb(game).execute(buildAutocompleteQuery(text, tcgLang(q.lang)))
  return { cards: rows.map(r => toTcgCard(game, r)) }
})
