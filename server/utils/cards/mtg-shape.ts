/**
 * Rebuild the Scryfall card shape the client consumes, from the local database.
 *
 * Search results and resolved cards flow through the app as raw Scryfall JSON:
 * the result grid reads `image_uris`, the detail view reads `card_faces`, token
 * auto-add reads `all_parts`. Serving that same shape from local rows turns the
 * backend swap into a drop-in replacement — the client does not change.
 *
 * Everything is reconstructed from what ingest stored:
 *  - colours come back from the 5-bit masks, in WUBRG order as Scryfall sends them;
 *  - image URLs are rebuilt from printing id + version and point at the local
 *    image route, which serves the mirror and back-fills anything missing;
 *  - images sit on the faces for double-faced cards and at the root otherwise —
 *    ingest only stored a face `img_version` when Scryfall gave that face its own
 *    images, so the stored data says which shape to emit, no layout guessing.
 */
import type { Client } from '@libsql/client'
import { isRecomposed, RECOMPOSED_VERSION } from '../images/recomposed'

type Row = Record<string, unknown>

const COLOR_BITS = [['W', 1], ['U', 2], ['B', 4], ['R', 8], ['G', 16]] as const

export function colorsFromMask(mask: unknown): string[] {
  const m = Number(mask) || 0
  return COLOR_BITS.filter(([, bit]) => (m & bit) !== 0).map(([c]) => c)
}

export const IMAGE_SIZES = ['small', 'normal', 'large', 'png', 'art_crop'] as const
export type ImageSize = typeof IMAGE_SIZES[number]
export type ImageFace = 'front' | 'back'

export function imageUrl(size: ImageSize, face: ImageFace, id: string, version: unknown, variant?: 'thumb', recomposed = false): string {
  const ext = size === 'png' ? 'png' : 'jpg'
  const params = new URLSearchParams()
  // The version doubles as a cache buster: when Scryfall re-scans an image the
  // URL changes, so browsers may cache the old one forever without going stale.
  if (version)
    params.set('v', String(version))
  // A 320 px WebP copy, made by the image route (normal size only).
  if (variant)
    params.set('size', variant)
  // The recomposed French card (server/utils/images/recomposed.ts), cached apart.
  if (recomposed)
    params.set('r', RECOMPOSED_VERSION)
  const query = params.size ? `?${params}` : ''
  return `/api/images/mtg/${size}/${face}/${id}.${ext}${query}`
}

function imageUris(face: ImageFace, id: string, version: unknown, recomposed = false): Record<ImageSize, string> {
  return Object.fromEntries(IMAGE_SIZES.map(s => [s, imageUrl(s, face, id, version, undefined, recomposed && s !== 'art_crop')])) as Record<ImageSize, string>
}

/** Scryfall sends prices as two-decimal strings; the client formats them as-is. */
function price(v: unknown): string | null {
  return typeof v === 'number' ? v.toFixed(2) : null
}

/** libsql returns NULL as `null`; Scryfall omits absent fields. Keep the omission. */
function opt<T>(v: T | null): T | undefined {
  return v === null ? undefined : v
}

function placeholders(n: number): string {
  return Array.from({ length: n }).fill('?').join(',')
}

async function group(db: Client, sql: string, ids: string[], key: string): Promise<Map<string, Row[]>> {
  const out = new Map<string, Row[]>()
  if (!ids.length)
    return out
  const { rows } = await db.execute({ sql: sql.replace('?#', placeholders(ids.length)), args: ids })
  for (const r of rows) {
    const k = String(r[key])
    const list = out.get(k)
    if (list)
      list.push(r)
    else
      out.set(k, [r])
  }
  return out
}

/**
 * Turn rows carrying `oracle_cards.*` + the printing columns into Scryfall-shaped
 * cards. Faces and token links are fetched in one query each for the whole
 * batch, never per card.
 */
export interface ShapeOptions {
  /**
   * Per row: show the recomposed French card when there is one ("[HD]" on the
   * deck line). Without it, Scryfall's scan.
   */
  hd?: readonly boolean[]
}

export async function toScryfallShape(db: Client, rows: Row[], opts: ShapeOptions = {}): Promise<Row[]> {
  if (!rows.length)
    return []

  const printingIds = [...new Set(rows.map(r => String(r.printing_id)))]
  const oracleIds = [...new Set(rows.map(r => String(r.oracle_id)))]

  const facesBy = await group(db, `SELECT * FROM card_faces WHERE printing_id IN (?#) ORDER BY printing_id, face_index`, printingIds, 'printing_id')
  const partsBy = await group(db, `SELECT oracle_id, related_name FROM card_parts WHERE oracle_id IN (?#)`, oracleIds, 'oracle_id')

  return rows.map((r, index) => {
    const id = String(r.printing_id)
    const faces = facesBy.get(id) ?? []
    const parts = partsBy.get(String(r.oracle_id)) ?? []
    // Images live on the faces exactly when the front face stored its own.
    const perFace = faces[0]?.img_version != null

    const card: Row = {
      id,
      oracle_id: r.oracle_id,
      name: r.name,
      printed_name: opt(r.printed_name),
      lang: r.lang,
      set: r.set_code,
      set_name: r.set_name,
      collector_number: r.collector_number,
      rarity: r.rarity,
      released_at: opt(r.released_at),
      promo: !!r.promo,
      artist: opt(r.artist),
      // Scryfall redirects this short form to the canonical card page.
      scryfall_uri: `https://scryfall.com/card/${r.set_code}/${r.collector_number}`,
      layout: r.layout,
      type_line: opt(r.type_line),
      printed_type_line: opt(r.printed_type_line),
      mana_cost: opt(r.mana_cost),
      cmc: r.cmc,
      oracle_text: opt(r.oracle_text),
      printed_text: opt(r.printed_text),
      colors: colorsFromMask(r.colors_mask),
      color_identity: colorsFromMask(r.identity_mask),
      keywords: r.keywords ? JSON.parse(String(r.keywords)) : [],
      edhrec_rank: opt(r.edhrec_rank),
      image_status: r.image_status,
      legalities: { commander: r.legal_commander ? 'legal' : 'not_legal' },
      // BEHAVIOUR CHANGE, deliberate: the printing's own price, else the
      // cheapest printing of the card. The Scryfall proxy used to back-fill
      // French printings with the *default* printing's price instead. Only 1.9%
      // of French printings carry a price at all; the cheapest is also what a
      // player buying the card actually pays.
      prices: { eur: price(r.price_eur ?? r.min_price_eur) },
    }

    // French printings recomposed in HD; shown when asked. A double-faced
    // card has its front, and its back when that one could be made too.
    const recomposable = r.lang === 'fr' && isRecomposed(id)
    const hd = recomposable && !!opts.hd?.[index]
    if (!perFace) {
      card.image_uris = imageUris('front', id, r.img_version, hd)
      if (recomposable) {
        card.recomposable = true
        // For a preview outside a deck (the library): the HD card, not pinned.
        card.recomposed_image = imageUrl('large', 'front', id, r.img_version, undefined, true)
      }
      if (hd)
        card.recomposed = true
    }

    if (faces.length) {
      card.card_faces = faces.map(f => ({
        name: f.name,
        printed_name: opt(f.printed_name),
        type_line: opt(f.type_line),
        printed_type_line: opt(f.printed_type_line),
        mana_cost: opt(f.mana_cost),
        oracle_text: opt(f.oracle_text),
        printed_text: opt(f.printed_text),
        ...(f.img_version != null
          ? { image_uris: Number(f.face_index) === 0
              ? imageUris('front', id, f.img_version, hd)
              : imageUris('back', id, f.img_version, hd && isRecomposed(`${id}-back`)) }
          : {}),
      }))
      if (perFace && recomposable) {
        card.recomposable = true
        card.recomposed_image = imageUrl('large', 'front', id, faces[0]!.img_version, undefined, true)
      }
      if (perFace && hd)
        card.recomposed = true
    }

    // Only tokens are stored — the one component the client reads. Always
    // emitted, empty when the card makes none: the data is oracle-level and
    // complete, so "no tokens" is a known answer. Scryfall omits the field
    // instead, which made the client re-query for every token-less card.
    card.all_parts = parts.map(p => ({ id: '', component: 'token', name: p.related_name }))

    return card
  })
}
