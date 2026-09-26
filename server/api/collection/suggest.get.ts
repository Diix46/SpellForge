import { useMtgCardsDb } from '../../utils/cards/db'
import { imageUrl } from '../../utils/cards/mtg-shape'
import { fold, ftsPhrase } from '../../utils/cards/text'

const PREFIX_END = String.fromCharCode(0xFFFF)

// Magic cards to add to a collection, found by their English name or the
// French one printed on them (?q=, &lang=fr|en): the English name finds the
// card, the name shown is the site language's, with a picture.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const text = typeof q.q === 'string' ? q.q.trim().slice(0, 100) : ''
  const lang = q.lang === 'en' ? 'en' : 'fr'
  const phrase = ftsPhrase(text)
  if (text.length < 2 || !phrase)
    return { cards: [] }
  const start = fold(text)
  const { rows } = await useMtgCardsDb().execute({
    sql: `SELECT o.name, o.name_folded, o.edhrec_sort, bp.printing_id, p.printed_name, p.img_version,
                 (SELECT f.img_version FROM card_faces f WHERE f.printing_id = bp.printing_id AND f.face_index = 0) AS face_img
            FROM oracle_cards o
            LEFT JOIN best_printings bp ON bp.oracle_id = o.oracle_id AND bp.lang = ?
            LEFT JOIN printings p ON p.id = bp.printing_id
           WHERE o.oracle_id IN (SELECT oracle_id FROM card_search WHERE card_search MATCH ?)
             AND o.is_extra = 0 AND o.is_funny = 0
           ORDER BY (o.name_folded >= ? AND o.name_folded < ?) DESC,
                    (lower(p.printed_name) LIKE ?) DESC,
                    o.edhrec_sort
           LIMIT 8`,
    args: [lang, `{name_folded printed_name} : ${phrase}*`, start, `${start}${PREFIX_END}`, `${text.toLowerCase()}%`],
  })
  return {
    cards: rows.map((r) => {
      const name = String(r.name)
      const printed = r.printed_name == null ? null : String(r.printed_name)
      return {
        name,
        label: printed ?? name,
        // The other name, when the one shown is not the one typed from.
        hint: printed && printed !== name ? name : null,
        thumb: r.printing_id ? imageUrl('normal', 'front', String(r.printing_id), r.img_version ?? r.face_img, 'thumb') : null,
      }
    }),
  }
})
