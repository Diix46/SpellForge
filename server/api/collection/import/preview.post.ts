import type { ImportRow } from '../../../../shared/collection-csv'
import { IMPORT_MAX_ROWS } from '../../../../shared/collection-csv'
import { requireAppUser } from '../../../utils/appUser'
import { gameOf } from '../../../utils/collection/copies'
import { resolveImport } from '../../../utils/collection/import'

// The rows of a file (read in the browser, shared/collection-csv.ts) matched
// to printings, for the preview: { game, rows } → { rows }.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  rateLimit(`collection:import:${user.id}`, 30, 60_000)
  const body = (await readBody(event).catch(() => null) ?? {}) as Record<string, unknown>
  const game = gameOf(body.game)
  const rows = Array.isArray(body.rows) ? (body.rows as ImportRow[]) : []
  if (!rows.length || rows.length > IMPORT_MAX_ROWS)
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: `Entre 1 et ${IMPORT_MAX_ROWS} lignes` })
  const clean = rows.map((r, i) => ({
    ...r,
    line: Number.isInteger(r.line) ? r.line : i + 1,
    name: typeof r.name === 'string' ? r.name.slice(0, 200) : null,
    set: typeof r.set === 'string' ? r.set.slice(0, 12).toLowerCase() : null,
    setName: typeof r.setName === 'string' ? r.setName.slice(0, 120) : null,
    number: typeof r.number === 'string' ? r.number.slice(0, 20) : null,
    printingId: typeof r.printingId === 'string' ? r.printingId.slice(0, 64) : null,
    lang: r.lang === 'fr' || r.lang === 'en' ? r.lang : null,
  }))
  return { rows: await resolveImport(game, clean) }
})
