// All printings of a card (for the print-selector gallery in the detail modal).
// Returns a slim list with set, collector number, set name, image, price and lang
// so the user can pin a specific edition/art to a deck entry.
//
// Cached 24h per (name, lang): the set of printings for a card is stable.

// Explicit import: `getImageUris` exists both here (server) and as a client
// composable export, so the auto-import global is ambiguous — import the server
// copy directly to bind to the right one.
import type { ScryImg } from '~~/server/utils/scryfall'
import { getImageUris } from '~~/server/utils/scryfall'

interface ScryPrint {
  id: string
  name: string
  printed_name?: string
  set: string
  set_name: string
  collector_number: string
  lang: string
  released_at?: string
  image_status?: string
  image_uris?: ScryImg
  card_faces?: Array<{ image_uris?: ScryImg }>
  prices?: { eur?: string | null }
  promo?: boolean
}

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

function thumb(c: ScryPrint): string | null {
  const uris = getImageUris(c)
  return uris?.normal ?? uris?.small ?? null
}

function hasImage(c: ScryPrint): boolean {
  return !!thumb(c) && c.image_status !== 'missing' && c.image_status !== 'placeholder'
}

export default defineCachedEventHandler(async (event): Promise<{ prints: PrintOption[] }> => {
  const query = getQuery(event)
  const name = typeof query.name === 'string' ? query.name.trim() : ''
  const lang = query.lang === 'fr' ? 'fr' : 'en'
  if (!name)
    return { prints: [] }

  // All printings (any language) of the exact card, newest first.
  const q = `!"${name.replace(/"/g, '')}" include:extras`
  const url = `${SCRYFALL_SEARCH}?q=${encodeURIComponent(q)}&unique=prints&order=released&dir=desc&include_multilingual=true`

  let data: { data?: ScryPrint[] }
  try {
    const res = await scryfallFetch(url)
    if (res.status === 404)
      return { prints: [] }
    if (!res.ok)
      throw createError({ statusCode: 502, statusMessage: `Scryfall ${res.status}` })
    data = await res.json()
  }
  catch (err) {
    // Re-throw an already-shaped H3/createError; wrap anything else.
    if (err instanceof Error && 'statusCode' in err)
      throw err
    throw createError({ statusCode: 502, statusMessage: 'Scryfall fetch failed' })
  }

  const target = name.toLowerCase()
  const all = (data.data ?? [])
    .filter(c => hasImage(c) && c.name.toLowerCase() === target)
    .map<PrintOption>(c => ({
      id: c.id,
      set: c.set,
      setName: c.set_name,
      collectorNumber: c.collector_number,
      lang: c.lang,
      image: thumb(c),
      priceEur: c.prices?.eur ?? null,
      promo: !!c.promo,
    }))

  // Surface the requested language first, then the rest (released-desc within each).
  const preferred = all.filter(p => p.lang === lang)
  const others = all.filter(p => p.lang !== lang)
  return { prints: [...preferred, ...others] }
}, {
  maxAge: 60 * 60 * 24,
  name: 'scryfall-prints',
  getKey: (event) => {
    const q = getQuery(event)
    const name = typeof q.name === 'string' ? q.name.trim().toLowerCase() : ''
    const lang = q.lang === 'fr' ? 'fr' : 'en'
    return `${lang}:${name}`
  },
})
