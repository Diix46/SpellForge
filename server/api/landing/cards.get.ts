/**
 * Card art for the landing hero, served from the local database.
 *
 * Same contract as before — a pool of 90 `{ name, image, art, artist, colors }`
 * the client scatters into its card tide — and the same selection: high-res,
 * printed on paper, not digital-only, rare or mythic, with no tokens, emblems,
 * basics, joke sets, art series or Universes Beyond, drawn at random from the
 * most played cards.
 *
 * Scryfall served one random page of 175 among the first 25 (8 in French).
 * Here the same depth is sampled directly. Sampling one printing per card
 * across that depth costs ~230 ms, and this is the most visited page, so the
 * pool is cached for two minutes per language — as the original was.
 */
import { useMtgCardsDb } from '../../utils/cards/db'
import { colorsFromMask, imageUrl } from '../../utils/cards/mtg-shape'

export interface LandingCard {
  name: string
  image: string
  art: string
  artist: string
  colors: string[]
}

const POOL_SIZE = 90
// The depth the old proxy drew its random page from: 25 pages of 175 in
// English, 8 in French (the smaller pool).
const DEPTH = { en: 25 * 175, fr: 8 * 175 }

export default defineCachedEventHandler(async (event): Promise<{ cards: LandingCard[] }> => {
  const lang = getQuery(event).lang === 'fr' ? 'fr' : 'en'
  const db = useMtgCardsDb()

  // One printing per card, as Scryfall's default `unique=cards` did. Without
  // this, the most reprinted cards would crowd out everything else.
  const { rows } = await db.execute({
    sql: `SELECT * FROM (
            SELECT * FROM (
              SELECT p.id, p.img_version, p.artist, p.printed_name,
                     o.name, o.colors_mask, o.edhrec_sort,
                     ROW_NUMBER() OVER (PARTITION BY p.oracle_id ORDER BY p.released_at DESC) AS rn
                FROM printings p
                JOIN oracle_cards o ON o.oracle_id = p.oracle_id
               WHERE p.lang = ?
                 AND p.is_highres = 1 AND p.is_paper = 1
                 AND p.is_digital = 0 AND p.is_ub = 0
                 AND p.rarity IN ('rare', 'mythic')
                 AND o.is_extra = 0 AND o.is_funny = 0
                 AND o.type_line NOT LIKE '%Basic%'
            ) WHERE rn = 1
            ORDER BY edhrec_sort
            LIMIT ?
          )
          ORDER BY random()
          LIMIT ?`,
    args: [lang, DEPTH[lang], POOL_SIZE],
  })
  // Throw rather than return an empty pool: the cache would otherwise keep
  // serving a hero with no art for the whole window.
  if (!rows.length)
    throw createError({ statusCode: 503, statusMessage: 'No landing art available' })

  // Double-faced French printings carry their localised name on the front face.
  const ids = rows.map(r => String(r.id))
  const { rows: faces } = await db.execute({
    sql: `SELECT printing_id, printed_name FROM card_faces
           WHERE face_index = 0 AND printing_id IN (${ids.map(() => '?').join(',')})`,
    args: ids,
  })
  const faceName = new Map(faces.map(f => [String(f.printing_id), f.printed_name]))

  return {
    cards: rows.map((r) => {
      const id = String(r.id)
      return {
        name: String(r.printed_name ?? faceName.get(id) ?? r.name),
        image: imageUrl('normal', 'front', id, r.img_version),
        // The art crop is not pre-mirrored: the image route fetches each one
        // once from Scryfall, then serves it from disk.
        art: imageUrl('art_crop', 'front', id, r.img_version),
        artist: String(r.artist ?? ''),
        colors: colorsFromMask(r.colors_mask).map(c => c.toLowerCase()),
      }
    }),
  }
}, {
  // The pool changes every two minutes; the client shuffles and scatters it
  // per visit, so two visitors in one window still rarely see the same hero.
  maxAge: 120,
  name: 'landing-cards',
  getKey: event => (getQuery(event).lang === 'fr' ? 'pool-fr' : 'pool-en'),
})
