// Random gorgeous MTG card art for the marketing landing hero. Returns a POOL of
// art-crops; the client picks a handful at random per visit, so the hero feels
// alive and different every time WITHOUT hitting Scryfall on every page load.
//
// One Scryfall /cards/search per cache-miss (not one /random per card): we ask
// for a wide set of high-res, paper, non-token cards with real art, take a random
// page, and slim each to { art, colors, name }. Cached ~10 min (SWR) so a burst of
// visitors is coalesced into a single upstream request — polite to Scryfall.

interface ScryImg { art_crop?: string, normal?: string }
interface ScryCard {
  name?: string
  artist?: string
  type_line?: string
  colors?: string[]
  color_identity?: string[]
  image_uris?: ScryImg
  card_faces?: Array<{ image_uris?: ScryImg, artist?: string }>
}

export interface LandingCard {
  name: string
  art: string // widescreen art_crop — ideal for a full-bleed cinematic background
  image: string // the full bordered card (normal) — for the interactive card-pile hero
  artist: string // illustrator credit (shown discreetly, gallery-style)
  colors: string[] // WUBRG letters (empty = colourless)
}

// Iconic, varied, recognizably MAGIC: high-res paper cards, rare/mythic for the
// best art, excluding tokens/emblems/basics, the joke "acorn" sets, art-series,
// AND Universes Beyond (-is:ub) so the hero doesn't look like a Marvel/LOTR ad.
// `order=edhrec` surfaces the most-played cards across Magic's whole history —
// the staples with the most beloved art — and a random page keeps it fresh.
const QUERY = 'is:hires game:paper -is:digital -is:ub -t:token -t:emblem -t:basic -is:funny -layout:art_series (rarity:rare or rarity:mythic)'
// A full-screen card "tide" needs plenty of distinct cards so the pile never
// looks repetitive; the client scatters as many as fit the viewport (capped),
// and repeats from the pool only on very large/ultrawide screens.
const POOL_SIZE = 90

function art(c: ScryCard): string | null {
  return c.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.art_crop ?? null
}
function image(c: ScryCard): string | null {
  return c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? null
}

export default defineCachedEventHandler(async (): Promise<{ cards: LandingCard[] }> => {
  // Scryfall paginates 175/page; a random page over the most-played cards keeps
  // results gorgeous + recognizable while varying the pool between cache windows.
  const page = 1 + Math.floor(Math.random() * 25)
  const url = `${SCRYFALL_SEARCH}?q=${encodeURIComponent(QUERY)}&order=edhrec&dir=asc&page=${page}`

  const res = await scryfallFetch(url)
  if (!res.ok)
    throw createError({ statusCode: 502, statusMessage: `Scryfall ${res.status}` })

  const data = await res.json() as { data?: ScryCard[] }
  const all = (data.data ?? [])
    .filter(c => art(c) && image(c) && c.name)
    .map<LandingCard>(c => ({
      name: c.name!,
      art: art(c)!,
      image: image(c)!,
      artist: c.artist ?? c.card_faces?.[0]?.artist ?? '',
      colors: (c.colors ?? c.color_identity ?? []).map(x => x.toLowerCase()),
    }))

  // Shuffle (Fisher–Yates) and keep a pool; the client picks N at random per visit.
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!]
  }

  return { cards: all.slice(0, POOL_SIZE) }
}, {
  // Short cache (no SWR): the pool rotates to a fresh random Scryfall page every
  // ~2 min, so the hero genuinely changes — while a burst of visits within the
  // window is still coalesced into one upstream request (polite to Scryfall).
  // The client shuffles + scatters this pool into the card-tide hero per visit,
  // so even within one window two visitors rarely see the same arrangement.
  maxAge: 120,
  name: 'landing-cards',
  // Constant key: the client appends a `_` cache-buster (to dodge the BROWSER's
  // HTTP cache), but the SERVER must ignore it so all visits within the window
  // share one slot — one upstream Scryfall call, not one per visitor.
  getKey: () => 'pool',
})
