/**
 * A card's preview image for the coach's hover cards, from the local database.
 *
 * Same contract as before: `{ name, image }`, with a null image when the card
 * is unknown. The French printing is used when it has a real image and the
 * English one otherwise — exactly how the resolver already picks a printing.
 *
 * The coach writes English names, usually exactly. Scryfall's fuzzy lookup also
 * absorbed partial names ("Atraxa"); the local fallback runs the autocomplete
 * query and takes its first answer, which covers partial names but not typos.
 */
import { useMtgCardsDb } from '../../utils/cards/db'
import { buildAutocompleteQuery } from '../../utils/cards/mtg-query'
import { resolveEntries } from '../../utils/cards/mtg-resolve'

interface ImageUris { normal?: string, large?: string }
interface ShapedCard {
  name: string
  image_uris?: ImageUris
  card_faces?: Array<{ image_uris?: ImageUris }>
}

function pickImage(card: ShapedCard): string | null {
  const uris = card.image_uris ?? card.card_faces?.[0]?.image_uris
  return uris?.normal ?? uris?.large ?? null
}

export default defineEventHandler(async (event): Promise<{ name: string, image: string | null }> => {
  const q = getQuery(event)
  const name = typeof q.name === 'string' ? q.name.trim().slice(0, 120) : ''
  const lang = typeof q.lang === 'string' && q.lang.trim().toLowerCase() === 'fr' ? 'fr' : 'en'
  if (!name)
    return { name: '', image: null }

  const db = useMtgCardsDb()
  let [row] = await resolveEntries(db, [{ name }], lang)

  if (!row?.card && name.length >= 2) {
    const { rows } = await db.execute(buildAutocompleteQuery(name, 1))
    const guess = rows[0]?.name
    if (guess)
      [row] = await resolveEntries(db, [{ name: String(guess) }], lang)
  }

  const card = row?.card as ShapedCard | null | undefined
  return card ? { name: card.name, image: pickImage(card) } : { name, image: null }
})
