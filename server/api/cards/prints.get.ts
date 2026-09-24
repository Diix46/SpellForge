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
import type { PrintOption } from '../../../shared/mtg/prints'
import { useMtgCardsDb } from '../../utils/cards/db'
import { listPrints } from '../../utils/cards/mtg-prints'

export default defineEventHandler(async (event): Promise<{ prints: PrintOption[] }> => {
  const q = getQuery(event)
  const name = typeof q.name === 'string' ? q.name.trim().slice(0, 160) : ''
  const lang = q.lang === 'fr' ? 'fr' : 'en'
  if (!name)
    return { prints: [] }
  return { prints: await listPrints(useMtgCardsDb(), name, lang) }
})
