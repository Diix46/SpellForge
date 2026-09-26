import { requireAppUser } from '../../../utils/appUser'
import { gameOf } from '../../../utils/collection/copies'
import { ownedLines } from '../../../utils/collection/lines'
import { checklistSet, setChecklist } from '../../../utils/collection/sets'

// One set's checklist: its cards in order, with what the member owns of each
// (?game=mtg|optcg, &lang=fr|en for the names and pictures).
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const q = getQuery(event)
  const game = gameOf(q.game)
  const lang = q.lang === 'en' ? 'en' : 'fr'
  const code = String(getRouterParam(event, 'code') ?? '').slice(0, 20)
  const cards = await setChecklist(game, code, await ownedLines(user.id, game), lang)
  const set = await checklistSet(game, code, cards, lang)
  if (!set)
    throw createError({ statusCode: 404, message: 'Unknown set' })
  return { set, cards }
})
