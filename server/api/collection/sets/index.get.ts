import { requireAppUser } from '../../../utils/appUser'
import { gameOf } from '../../../utils/collection/copies'
import { ownedLines } from '../../../utils/collection/lines'
import { setProgress } from '../../../utils/collection/sets'

// How far the member's collection goes into each set it has started
// (?game=mtg|optcg, &all=1 for every set, &lang=fr|en for One Piece names).
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const q = getQuery(event)
  const game = gameOf(q.game)
  const sets = await setProgress(game, await ownedLines(user.id, game), { all: q.all === '1', lang: q.lang === 'en' ? 'en' : 'fr' })
  return { sets }
})
