/**
 * Card-name autocomplete, served from the local database.
 *
 * Same contract as the Scryfall proxy it replaces — `{ names }`, at most 20,
 * nothing under two characters — and the same ordering, checked against the
 * live API: names starting with the text first, then later-word matches. No
 * route cache: the lookup is indexed and answers faster than a cache round trip.
 */
import { useMtgCardsDb } from '../../utils/cards/db'
import { buildAutocompleteQuery } from '../../utils/cards/mtg-query'

export default defineEventHandler(async (event): Promise<{ names: string[] }> => {
  const q = getQuery(event).q
  const text = typeof q === 'string' ? q.trim().slice(0, 100) : ''
  if (text.length < 2)
    return { names: [] }

  const { rows } = await useMtgCardsDb().execute(buildAutocompleteQuery(text))
  return { names: rows.map(r => String(r.name)) }
})
