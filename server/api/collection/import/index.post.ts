import type { Condition, Finish } from '../../../../shared/collection'
import { sql } from 'drizzle-orm'
import { MAX_COPIES } from '../../../../shared/collection'
import { IMPORT_MAX_ROWS } from '../../../../shared/collection-csv'
import { requireAppUser } from '../../../utils/appUser'
import { collectionCards } from '../../../utils/collection/cards'
import { copyFields, gameOf } from '../../../utils/collection/copies'
import { schema, useDb } from '../../../utils/db'
import { genId } from '../../../utils/id'

/** What an import added, line by line, for undoing it. */
interface ImportedItem { printingId: string, finish: Finish, condition: Condition, quantity: number }

const BATCH = 400

// Import the previewed rows: { game, format, filename?, items: [{ printingId,
// finish, condition, quantity, purchasePrice?, location?, note? }] }. Each
// joins its line like a copy added by hand; the import is kept, to undo.
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  rateLimit(`collection:import:${user.id}`, 30, 60_000)
  const body = (await readBody(event).catch(() => null) ?? {}) as Record<string, unknown>
  const game = gameOf(body.game)
  const raw = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : []
  if (!raw.length || raw.length > IMPORT_MAX_ROWS)
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: `Entre 1 et ${IMPORT_MAX_ROWS} lignes` })

  const items = raw.map(r => ({ printingId: typeof r.printingId === 'string' ? r.printingId : '', ...copyFields(r, false) }))
  const cards = await collectionCards(game, [...new Set(items.map(i => i.printingId))])
  const valid = items.filter(i => cards.get(i.printingId)?.finishes.includes(i.finish!))
  if (!valid.length)
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Aucune ligne à importer' })

  const db = useDb()
  const t = schema.collectionItems
  const upserts = valid.map(i => db.insert(t).values({
    id: genId('c_'),
    userId: user.id,
    game,
    printingId: i.printingId,
    finish: i.finish!,
    condition: i.condition!,
    quantity: i.quantity!,
    purchasePrice: i.purchasePrice ?? null,
    location: i.location ?? null,
    note: i.note ?? null,
  }).onConflictDoUpdate({
    target: [t.userId, t.game, t.printingId, t.finish, t.condition],
    set: {
      quantity: sql`min(${t.quantity} + ${i.quantity!}, ${MAX_COPIES})`,
      updatedAt: new Date(),
      ...(i.purchasePrice != null ? { purchasePrice: i.purchasePrice } : {}),
      ...(i.location ? { location: i.location } : {}),
      ...(i.note ? { note: i.note } : {}),
    },
  }))

  // One entry per line key, the quantities added summed: what undo takes back.
  const added = new Map<string, ImportedItem>()
  for (const i of valid) {
    const key = `${i.printingId}|${i.finish}|${i.condition}`
    const prev = added.get(key)
    added.set(key, { printingId: i.printingId, finish: i.finish!, condition: i.condition!, quantity: (prev?.quantity ?? 0) + i.quantity! })
  }
  const copies = valid.reduce((n, i) => n + i.quantity!, 0)
  const record = db.insert(schema.collectionImports).values({
    id: genId('i_'),
    userId: user.id,
    game,
    format: String(body.format ?? 'csv').slice(0, 20),
    filename: typeof body.filename === 'string' && body.filename ? body.filename.slice(0, 120) : null,
    lines: valid.length,
    copies,
    items: JSON.stringify([...added.values()]),
  }).returning({ id: schema.collectionImports.id })

  for (let i = 0; i < upserts.length; i += BATCH) {
    const chunk = upserts.slice(i, i + BATCH)
    await db.batch(chunk as [typeof chunk[number], ...typeof chunk])
  }
  const [saved] = await record
  return { importId: saved!.id, lines: valid.length, copies, skipped: items.length - valid.length }
})
