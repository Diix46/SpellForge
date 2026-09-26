import type { InValue } from '@libsql/client'
import type { PreconSummary } from '../../../../shared/collection-decks'
import { PRECON_KINDS } from '../../../../shared/collection-decks'
import { useMtgCardsDb, usePreconsDb } from '../../../utils/cards/db'
import { imageUrl } from '../../../utils/cards/mtg-shape'

const KIND_TYPES: Record<string, string[]> = {
  commander: ['Commander Deck', 'Brawl Deck'],
  secretlair: ['Secret Lair Drop'],
  jumpstart: ['Jumpstart'],
}

// Magic preconstructed decks to add whole (?q= name, set code or commander,
// &kind=commander|secretlair|jumpstart|other), newest first, each with its
// face (the commander's card) and its set's name.
export default defineEventHandler(async (event): Promise<{ precons: PreconSummary[] }> => {
  const q = getQuery(event)
  const text = typeof q.q === 'string' ? q.q.trim().slice(0, 80).toLowerCase() : ''
  const kind = PRECON_KINDS.includes(q.kind as never) ? String(q.kind) : null
  const where: string[] = []
  const args: InValue[] = []
  if (text) {
    where.push('(lower(name) LIKE ? OR code = ? OR lower(commander) LIKE ?)')
    args.push(`%${text}%`, text, `%${text}%`)
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
  const mtg = useMtgCardsDb()
  const images = faces.length
    ? new Map((await mtg.execute({
        sql: `SELECT p.id, COALESCE(p.img_version, (SELECT f.img_version FROM card_faces f WHERE f.printing_id = p.id AND f.face_index = 0)) AS v
                FROM printings p WHERE p.id IN (${faces.map(() => '?').join(',')})`,
        args: faces,
      })).rows.map(r => [String(r.id), r.v]))
    : new Map()
  const setNames = codes.length
    ? new Map((await mtg.execute({ sql: `SELECT code, name FROM sets WHERE code IN (${codes.map(() => '?').join(',')})`, args: codes })).rows.map(r => [String(r.code), String(r.name)]))
    : new Map()

  return {
    precons: rows.map((r) => {
      const face = r.face_id == null ? null : String(r.face_id)
      return {
        file: String(r.file),
        code: String(r.code),
        name: String(r.name),
        type: String(r.type),
        released: r.released == null ? null : String(r.released),
        cards: Number(r.cards),
        commander: r.commander == null ? null : String(r.commander),
        setName: setNames.get(String(r.code)) ?? null,
        thumb: face && images.has(face) ? imageUrl('normal', 'front', face, images.get(face), 'thumb') : null,
      }
    }),
  }
})
