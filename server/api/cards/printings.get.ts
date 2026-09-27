/**
 * A Magic card's printings for its public page: each one's scan, set and
 * price, to flip through. Read-only and open to all (choosing a printing for
 * a deck stays with members, /api/cards/prints).
 */
import { useMtgCardsDb } from '../../utils/cards/db'
import { listPrints } from '../../utils/cards/mtg-prints'

const MAX = 40

export default defineCachedEventHandler(async (event) => {
  const q = getQuery(event)
  const name = typeof q.name === 'string' ? q.name.trim().slice(0, 160) : ''
  const lang = q.lang === 'fr' ? 'fr' : 'en'
  if (!name)
    return { prints: [] }
  const prints = await listPrints(useMtgCardsDb(), name, lang, true)
  return {
    prints: prints.filter(p => p.image).slice(0, MAX).map(p => ({
      id: p.id,
      setName: p.setName,
      number: p.collectorNumber,
      lang: p.lang,
      image: p.image,
      imageLarge: p.imageLarge,
      priceEur: p.priceEur,
    })),
  }
}, {
  maxAge: 60 * 60,
  name: 'mtg-printings',
  getKey: event => `${getQuery(event).lang === 'fr' ? 'fr' : 'en'}:${String(getQuery(event).name ?? '').slice(0, 160)}`,
})
