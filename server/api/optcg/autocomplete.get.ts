/**
 * One Piece suggestions as the player types: cards, not names, since many
 * cards share a name.
 */
import { useOptcgCardsDb } from '../../utils/cards/db'
import { buildOptcgAutocompleteQuery } from '../../utils/cards/optcg-query'
import { toOptcgCard } from '../../utils/cards/optcg-shape'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const text = typeof q.q === 'string' ? q.q.trim().slice(0, 60) : ''
  const lang = q.lang === 'fr' ? 'fr' : 'en'
  if (text.length < 2)
    return { cards: [] }
  const { rows } = await useOptcgCardsDb().execute(buildOptcgAutocompleteQuery(text, lang))
  return { cards: rows.map(toOptcgCard) }
})
