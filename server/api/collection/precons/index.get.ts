import type { InValue } from '@libsql/client'
import type { PreconSummary } from '../../../../shared/collection-decks'
import { PRECON_KINDS } from '../../../../shared/collection-decks'
import { useMtgCardsDb, useOptcgCardsDb, usePreconsDb } from '../../../utils/cards/db'
import { imageUrl } from '../../../utils/cards/mtg-shape'
import { optcgImageUrl } from '../../../utils/cards/optcg-shape'
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
  if (q.game === 'optcg')
    return { precons: await optcgPrecons(text, lang) }
  const mtg = useMtgCardsDb()
  const where: string[] = ['game = \'mtg\'']
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
            WHERE ${where.join(' AND ')}
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

/**
 * One Piece starter decks (scripts/ingest-precons.mjs): names in the site's
 * language (Bandai's titles), the Leader as face, newest first.
 */
async function optcgPrecons(text: string, lang: 'fr' | 'en'): Promise<PreconSummary[]> {
  let rows
  try {
    rows = (await usePreconsDb().execute({
      sql: `SELECT file, code, name, name_fr, type, cards, commander FROM precons
             WHERE game = 'optcg' ${text ? 'AND (lower(name) LIKE ? OR lower(name_fr) LIKE ? OR lower(code) LIKE ?)' : ''}
             ORDER BY code DESC`,
      args: text ? [`%${text}%`, `%${text}%`, `%${text.replace('-', '')}%`] : [],
    })).rows
  }
  catch {
    return []
  }
  const leaders = [...new Set(rows.map(r => String(r.commander)).filter(Boolean))]
  const shown = new Map<string, { name: string, thumb: string }>()
  if (leaders.length) {
    const { rows: cards } = await useOptcgCardsDb().execute({
      sql: `SELECT b.card_number, c.id, c.lang, c.name, c.img_version FROM op_best b
              JOIN op_cards c ON c.id = b.id AND c.lang = b.row_lang
             WHERE b.lang = ? AND b.card_number IN (${leaders.map(() => '?').join(',')})`,
      args: [lang, ...leaders],
    })
    for (const c of cards)
      shown.set(String(c.card_number), { name: String(c.name), thumb: optcgImageUrl(String(c.lang), String(c.id), c.img_version, 'thumb') })
  }
  return rows.map((r) => {
    const leader = shown.get(String(r.commander))
    const code = String(r.file)
    return {
      file: code,
      code,
      name: (lang === 'fr' && r.name_fr ? String(r.name_fr) : String(r.name)),
      type: String(r.type),
      released: null,
      cards: Number(r.cards),
      commander: r.commander == null ? null : String(r.commander),
      commanderLocal: leader?.name ?? null,
      setName: code,
      thumb: leader?.thumb ?? null,
    }
  })
}
