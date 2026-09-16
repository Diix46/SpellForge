/**
 * One Piece cards for the landing: striking cards (Leaders and the higher
 * rarities) drawn at random, in the site language where the art exists. The
 * hero's card tide shows about half of them, so the pool is larger than the
 * other sections need, and each card carries only what the page shows.
 * Cached for two minutes per language, like the Magic pool next door.
 */
import type { LandingPoster } from '../../../shared/landing'
import { useOptcgCardsDb } from '../../utils/cards/db'
import { OPTCG_CARD_COLUMNS } from '../../utils/cards/optcg-query'
import { toOptcgCard } from '../../utils/cards/optcg-shape'

const POOL_SIZE = 48

export default defineCachedEventHandler(async (event): Promise<{ cards: LandingPoster[] }> => {
  const lang = getQuery(event).lang === 'fr' ? 'fr' : 'en'
  const { rows } = await useOptcgCardsDb().execute({
    sql: `SELECT ${OPTCG_CARD_COLUMNS}
            FROM op_numbers n
            JOIN op_best b ON b.card_number = n.card_number AND b.lang = ?
            JOIN op_cards c ON c.id = b.id AND c.lang = b.row_lang
           WHERE (n.category = 'Leader' OR c.rarity IN ('SuperRare', 'SecretRare'))
             AND n.is_banned = 0
             AND c.lang = ?
           ORDER BY random()
           LIMIT ?`,
    args: [lang, lang, POOL_SIZE],
  })
  if (!rows.length)
    throw createError({ statusCode: 503, statusMessage: 'No landing art available' })
  return {
    cards: rows.map(toOptcgCard).map(c => ({
      number: c.number,
      name: c.name,
      category: c.category,
      colors: c.colors,
      power: c.power,
      image: c.image,
      thumb: c.thumb,
    })),
  }
}, {
  maxAge: 120,
  name: 'landing-optcg-v2',
  getKey: event => (getQuery(event).lang === 'fr' ? 'pool-fr' : 'pool-en'),
})
