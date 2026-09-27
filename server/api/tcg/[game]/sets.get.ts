import { useTcgDb } from '../../../utils/tcg/db'
/**
 * A generic-engine game's sets, newest first, for the set filter.
 */
import { tcgGame, tcgLang } from '../../../utils/tcg/params'
import { buildSetsQuery, toTcgSet } from '../../../utils/tcg/query'

export default defineCachedEventHandler(async (event) => {
  const game = tcgGame(event)
  const { rows } = await useTcgDb(game).execute(buildSetsQuery(tcgLang(getQuery(event).lang)))
  return { sets: rows.map(r => toTcgSet(game, r)) }
}, { maxAge: 3600, getKey: event => `tcg-sets:${getRouterParam(event, 'game')}:${getQuery(event).lang}` })
