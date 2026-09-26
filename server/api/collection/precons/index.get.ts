import type { InValue } from '@libsql/client'
import type { PreconSummary } from '../../../../shared/collection-decks'
import { PRECON_KINDS } from '../../../../shared/collection-decks'
import { useMtgCardsDb, usePreconsDb } from '../../../utils/cards/db'
import { imageUrl } from '../../../utils/cards/mtg-shape'
import { ftsPhrase } from '../../../utils/cards/text'

const KIND_TYPES: Record<string, string[]> = {
  commander: ['Commander Deck', 'Brawl Deck'],
  secretlair: ['Secret Lair Drop'],
  jumpstart: ['Jumpstart'],
}

// Magic preconstructed decks to add whole (?q= name, set code or commander —
// in English or as printed in French —, &kind=commander|secretlair|jumpstart|other,
// &lang=fr|en), newest first, each with its face (the commander's card, in
// the site's language when printed so), its commander's name in that
// language and its set's name. Deck names stay English: no source gives the
// French product names.
export default defineEventHandler(async (event): Promise<{ precons: PreconSummary[] }> => {
  const q = getQuery(event)
  const text = typeof q.q === 'string' ? q.q.trim().slice(0, 80).toLowerCase() : ''
  const kind = PRECON_KINDS.includes(q.kind as never) ? String(q.kind) : null
  const lang = q.lang === 'en' ? 'en' : 'fr'
  const mtg = useMtgCardsDb()
  const where: string[] = []
  const args: InValue[] = []
  if (text) {
    // Commanders typed by their French name: their English names.
    const phrase = ftsPhrase(text)
    const english = phrase
      ? (await mtg.execute({
          sql: `SELECT o.name FROM oracle_cards o WHERE o.oracle_id IN (SELECT oracle_id FROM card_search WHERE card_search MATCH ?) LIMIT 40`,
          args: [`printed_name : ${phrase}*`],
        })).rows.map(r => String(r.name))
      : []
    where.push(`(lower(name) LIKE ? OR code = ? OR lower(commander) LIKE ?${english.length ? ` OR commander IN (${english.map(() => '?').join(',')})` : ''})`)
    args.push(`%${text}%`, text, `%${text}%`, ...english)
  }
  if (kind === 'other') {
    const all = Object.values(KIND_TYPES).flat()
    where.push(`type NOT IN (${all.map(() => '?').join(',')})`)
    args.push(...all)
  }
  else if (kind) {
    where.push(`type IN (${KIND_TYPES[kind]!.map(() => '?').join(',')})`)
    args.push(...KIND_TYPES[kind]!)
  }
  let rows
  try {
    rows = (await usePreconsDb().execute({
      sql: `SELECT file, code, name, type, released, cards, commander, face_id FROM precons
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY released DESC, name LIMIT 60`,
      args,
    })).rows
  }
  catch {
    // Not built yet (the nightly refresh builds it).
    return { precons: [] }
  }

  const faces = [...new Set(rows.map(r => r.face_id).filter(x => x != null).map(String))]
  const codes = [...new Set(rows.map(r => String(r.code)))]
  // Each face in the site's language when printed so: the same set and number.
  const images = new Map<string, { id: string, v: unknown }>()
  if (faces.length) {
    const { rows: found } = await mtg.execute({
      sql: `SELECT e.id AS face, COALESCE(l.id, e.id) AS id,
                   COALESCE(l.img_version, e.img_version, (SELECT f.img_version FROM card_faces f WHERE f.printing_id = COALESCE(l.id, e.id) AND f.face_index = 0)) AS v
              FROM printings e
              LEFT JOIN printings l ON l.set_code = e.set_code AND l.collector_number = e.collector_number AND l.lang = ? AND l.is_real_image = 1
             WHERE e.id IN (${faces.map(() => '?').join(',')})`,
      args: [lang, ...faces],
    })
    for (const r of found) {
      if (!images.has(String(r.face)))
        images.set(String(r.face), { id: String(r.id), v: r.v })
    }
  }
  const commanders = [...new Set(rows.map(r => r.commander).filter(x => x != null).map(String))]
  const localNames = commanders.length && lang === 'fr'
    ? new Map((await mtg.execute({
        sql: `SELECT o.name, p.printed_name FROM oracle_cards o
                JOIN best_printings b ON b.oracle_id = o.oracle_id AND b.lang = 'fr'
                JOIN printings p ON p.id = b.printing_id
               WHERE o.name IN (${commanders.map(() => '?').join(',')}) AND p.printed_name IS NOT NULL`,
        args: commanders,
      })).rows.map(r => [String(r.name), String(r.printed_name)]))
    : new Map<string, string>()
  const setNames = codes.length
    ? new Map((await mtg.execute({ sql: `SELECT code, name FROM sets WHERE code IN (${codes.map(() => '?').join(',')})`, args: codes })).rows.map(r => [String(r.code), String(r.name)]))
    : new Map()

  return {
    precons: rows.map((r) => {
      const face = r.face_id == null ? null : images.get(String(r.face_id))
      const commander = r.commander == null ? null : String(r.commander)
      return {
        file: String(r.file),
        code: String(r.code),
        name: String(r.name),
        type: String(r.type),
        released: r.released == null ? null : String(r.released),
        cards: Number(r.cards),
        commander,
        commanderLocal: commander ? localNames.get(commander) ?? commander : null,
        setName: setNames.get(String(r.code)) ?? null,
        thumb: face ? imageUrl('normal', 'front', face.id, face.v, 'thumb') : null,
      }
    }),
  }
})
