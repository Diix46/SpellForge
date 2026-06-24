// Resolve a single card NAME to a preview image URL, in the requested language
// when possible. Used by the Coach chat: it tags cards as [[Name]] and the front
// fetches this on hover to show the big card preview. Cached 24h per (name, lang)
// — a card's normal-size image is stable.
//
// Strategy: Scryfall /cards/named (fuzzy, English name from the LLM) → if lang=fr
// and the card has a non-English printing with a real image, prefer it; otherwise
// fall back to the English image. Returns { name, image } (image null if none).

import { getImageUris, SCRYFALL_CARDS, scryfallFetch } from '../../utils/scryfall'

interface NamedCard {
  name?: string
  printed_name?: string
  lang?: string
  image_uris?: { normal?: string, large?: string, png?: string }
  card_faces?: Array<{ image_uris?: { normal?: string, large?: string } }>
  set?: string
  collector_number?: string
  image_status?: string
}

function pickImage(card: NamedCard | null): string | null {
  const uris = getImageUris(card)
  return uris?.normal ?? uris?.large ?? null
}

export default defineCachedEventHandler(async (event): Promise<{ name: string, image: string | null }> => {
  const q = getQuery(event)
  const name = typeof q.name === 'string' ? q.name.trim().slice(0, 120) : ''
  const lang = typeof q.lang === 'string' && q.lang.trim().toLowerCase() === 'fr' ? 'fr' : 'en'
  if (!name)
    return { name: '', image: null }

  // 1) Canonical card via fuzzy named lookup (English name from the Coach).
  const namedUrl = `${SCRYFALL_CARDS}/named?fuzzy=${encodeURIComponent(name)}`
  const res = await scryfallFetch(namedUrl)
  if (res.status === 404)
    return { name, image: null }
  if (!res.ok)
    throw createError({ statusCode: 502, statusMessage: `Scryfall ${res.status}` })
  const card = await res.json() as NamedCard

  // 2) French requested → try the localized printing's image (same set/number).
  if (lang === 'fr' && card.set && card.collector_number) {
    try {
      const locUrl = `${SCRYFALL_CARDS}/${encodeURIComponent(card.set)}/${encodeURIComponent(card.collector_number)}/fr`
      const locRes = await scryfallFetch(locUrl)
      if (locRes.ok) {
        const loc = await locRes.json() as NamedCard
        // Skip the "Localized Image Not Available" placeholder; fall back to EN.
        if (loc.image_status !== 'placeholder' && loc.image_status !== 'missing') {
          const frImage = pickImage(loc)
          if (frImage)
            return { name: card.name ?? name, image: frImage }
        }
      }
    }
    catch {
      // fall through to the English image
    }
  }

  return { name: card.name ?? name, image: pickImage(card) }
}, {
  maxAge: 60 * 60 * 24,
  staleMaxAge: 60 * 60 * 24,
  swr: true,
  name: 'card-image',
  getKey: (event) => {
    const q = getQuery(event)
    const name = typeof q.name === 'string' ? q.name.trim().toLowerCase().slice(0, 120) : ''
    const lang = typeof q.lang === 'string' && q.lang.trim().toLowerCase() === 'fr' ? 'fr' : 'en'
    return `${lang}:${name}`
  },
})
