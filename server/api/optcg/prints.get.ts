/**
 * Every art of a One Piece card number, for the art picker.
 */
import { useOptcgCardsDb } from '../../utils/cards/db'
import { buildOptcgPrintsQuery } from '../../utils/cards/optcg-query'
import { OPTCG_NUMBER } from '../../utils/cards/optcg-resolve'
import { toOptcgPrint } from '../../utils/cards/optcg-shape'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const number = typeof q.number === 'string' ? q.number.trim().toUpperCase() : ''
  const lang = q.lang === 'fr' ? 'fr' : 'en'
  if (!OPTCG_NUMBER.test(number))
    return { prints: [] }
  const { rows } = await useOptcgCardsDb().execute(buildOptcgPrintsQuery(number, lang))
  return { prints: rows.map(toOptcgPrint) }
})
