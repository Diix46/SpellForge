/**
 * Cards named as other apps write them, matched to printings:
 * `{ lang, lines: [{ name, set?, number? }] }` → `{ ids }` in input order,
 * `null` where nothing matches. A set is its code or the abbreviation players
 * use (Pokémon TCG Live: "4 Charizard ex OBF 125"); without a set, or when
 * set and number miss, the newest printing of the name.
 */
import type { InValue } from '@libsql/client'
import { fold } from '../../../utils/cards/text'
import { useTcgDb } from '../../../utils/tcg/db'
import { tcgGame, tcgLang } from '../../../utils/tcg/params'

const MAX_LINES = 150

interface Line { name: string, set: string | null, number: string | null }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
/** "006", "6", "TG06": numbers compare without their leading zeros. */
const num = (v: string) => v.replace(/^0+(?=\d)/, '').toLowerCase()

export default defineEventHandler(async (event) => {
  const game = tcgGame(event)
  const body = await readBody<{ lang?: unknown, lines?: unknown }>(event)
  const raw = Array.isArray(body?.lines) ? body.lines : null
  if (!raw || raw.length > MAX_LINES)
    throw createError({ statusCode: 400, statusMessage: `lines must be an array of at most ${MAX_LINES}` })
  const lines: Line[] = raw.map(l => ({ name: str(l?.name, 120), set: str(l?.set, 12) || null, number: str(l?.number, 12) || null }))
  const lang = tcgLang(body?.lang)
  const db = useTcgDb(game)

  // Sets by code and by abbreviation.
  const { rows: sets } = await db.execute('SELECT DISTINCT code, abbr FROM sets')
  const setOf = new Map<string, string>()
  for (const s of sets) {
    setOf.set(String(s.code).toLowerCase(), String(s.code))
    if (s.abbr)
      setOf.set(String(s.abbr).toLowerCase(), String(s.code))
  }

  const codes = [...new Set(lines.map(l => (l.set ? setOf.get(l.set.toLowerCase()) : null)).filter((x): x is string => !!x))]
  const bySetNumber = new Map<string, string>()
  if (codes.length) {
    const { rows } = await db.execute({ sql: `SELECT DISTINCT id, set_code, number FROM cards WHERE set_code IN (${codes.map(() => '?').join(',')})`, args: codes as InValue[] })
    for (const r of rows)
      bySetNumber.set(`${String(r.set_code)}|${num(String(r.number))}`, String(r.id))
  }

  const names = [...new Set(lines.map(l => fold(l.name)).filter(Boolean))]
  const byName = new Map<string, string>()
  if (names.length) {
    const marks = names.map(() => '?').join(',')
    const { rows } = await db.execute({
      sql: `SELECT c.id, c.name_folded, c.card_key FROM cards c LEFT JOIN sets s ON s.code = c.set_code AND s.lang = c.lang
             WHERE (c.name_folded IN (${marks}) OR c.card_key IN (${marks}))
             ORDER BY c.image IS NULL, (c.lang = ?) DESC, s.released DESC`,
      args: [...names, ...names, lang] as InValue[],
    })
    for (const r of rows) {
      for (const k of [String(r.name_folded), String(r.card_key)]) {
        if (!byName.has(k))
          byName.set(k, String(r.id))
      }
    }
  }

  return {
    ids: lines.map((l) => {
      const code = l.set ? setOf.get(l.set.toLowerCase()) : undefined
      return (code && l.number ? bySetNumber.get(`${code}|${num(l.number)}`) : undefined) ?? byName.get(fold(l.name)) ?? null
    }),
  }
})
