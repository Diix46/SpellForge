import { useTcgDb } from '../../../utils/tcg/db'
/**
 * A generic-engine game's sets, newest first, for the set filter.
 */
import { tcgGame, tcgLang } from '../../../utils/tcg/params'
import { buildSetsQuery, toTcgSet } from '../../../utils/tcg/query'

export default defineCachedEventHandler(async (event) => {
  const game = tcgGame(event)
  const lang = tcgLang(getQuery(event).lang)
  const { rows } = await useTcgDb(game).execute(buildSetsQuery(lang))
  return { sets: rows.map(r => toTcgSet(game, r, lang)) }
}, { maxAge: 3600, getKey: event => `tcg-sets-2:${getRouterParam(event, 'game')}:${getQuery(event).lang}` })
