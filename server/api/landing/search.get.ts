/**
 * The landing's single search box: the first cards of both games whose name
 * starts with (or contains) the text, in the site language, each with its
 * image and its own page. Local databases only.
 */
import type { LandingHit, LandingSearch } from '../../../shared/landing'
import { cardPath } from '../../../shared/game'
import { useMtgCardsDb, useOptcgCardsDb } from '../../utils/cards/db'
import { buildAutocompleteQuery } from '../../utils/cards/mtg-query'
import { resolveEntries } from '../../utils/cards/mtg-resolve'
import { buildOptcgAutocompleteQuery } from '../../utils/cards/optcg-query'
import { toOptcgCard } from '../../utils/cards/optcg-shape'

const PER_GAME = 6

interface MtgRow {
  name: string
  printed_name?: string
  type_line?: string
  printed_type_line?: string
  image_uris?: { normal?: string }
  card_faces?: { printed_name?: string, image_uris?: { normal?: string } }[]
}

export default defineEventHandler(async (event): Promise<LandingSearch> => {
  const q = getQuery(event)
  const text = typeof q.q === 'string' ? q.q.trim().slice(0, 60) : ''
  const lang = q.lang === 'en' ? 'en' : 'fr'
  if (text.length < 2)
    return { optcg: [], mtg: [] }

  const [op, names] = await Promise.all([
    useOptcgCardsDb().execute(buildOptcgAutocompleteQuery(text, lang, PER_GAME)),
    useMtgCardsDb().execute(buildAutocompleteQuery(text, PER_GAME)),
  ])
  const resolved = await resolveEntries(useMtgCardsDb(), names.rows.map(r => ({ name: String(r.name) })), lang)

  const optcg: LandingHit[] = op.rows.map(toOptcgCard).map(c => ({
    id: c.number,
    name: c.name,
    meta: c.number,
    image: c.thumb,
    path: cardPath('optcg', c.number),
  }))
  const mtg: LandingHit[] = resolved.flatMap(({ card }) => {
    if (!card)
      return []
    const c = card as unknown as MtgRow
    const front = c.card_faces?.[0]
    return [{
      id: c.name,
      name: (lang === 'fr' ? c.printed_name ?? front?.printed_name : null) ?? c.name,
      meta: (lang === 'fr' ? c.printed_type_line : null) ?? c.type_line ?? '',
      image: c.image_uris?.normal ?? front?.image_uris?.normal ?? null,
      path: cardPath('mtg', c.name),
    }]
  })
  return { optcg, mtg }
})
