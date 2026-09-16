/**
 * All printings of a card, for the edition picker in the detail view, served
 * from the local database.
 *
 * Same contract as the Scryfall proxy it replaces. Deliberate differences:
 *
 *  - Only French and English printings exist locally, where Scryfall listed
 *    every language. The site is bilingual, and ingesting every language would
 *    take the card database from ~130 MB to ~700 MB.
 *
 *  - A double-faced card is found by its front-face name too. The detail view
 *    sends the name of the face on display, and Scryfall's exact search for
 *    "Delver of Secrets" returns printings named "Delver of Secrets //
 *    Insectile Aberration" — which the old full-name filter then discarded,
 *    all of them. The picker was empty for every double-faced card.
 *
 * Which card to list, and why only one, is explained in buildPrintsQuery.
 */
import { useMtgCardsDb } from '../../utils/cards/db'
import { buildPrintsQuery } from '../../utils/cards/mtg-query'
import { imageUrl } from '../../utils/cards/mtg-shape'

export interface PrintOption {
  id: string
  set: string
  setName: string
  collectorNumber: string
  lang: string
  image: string | null
  priceEur: string | null
  promo: boolean
}

export default defineEventHandler(async (event): Promise<{ prints: PrintOption[] }> => {
  const q = getQuery(event)
  const name = typeof q.name === 'string' ? q.name.trim().slice(0, 160) : ''
  const lang = q.lang === 'fr' ? 'fr' : 'en'
  if (!name)
    return { prints: [] }

  const { rows } = await useMtgCardsDb().execute(buildPrintsQuery(name, lang))

  return {
    prints: rows.map(r => ({
      id: String(r.id),
      set: String(r.set_code),
      setName: String(r.set_name ?? ''),
      collectorNumber: String(r.collector_number),
      lang: String(r.lang),
      // The front image version covers both single- and double-faced printings.
      image: imageUrl('normal', 'front', String(r.id), r.img_version),
      // Each printing shows its own price, not the card's cheapest.
      priceEur: typeof r.price_eur === 'number' ? r.price_eur.toFixed(2) : null,
      promo: !!r.promo,
    })),
  }
})
