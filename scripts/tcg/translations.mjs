/**
 * Unofficial translations for what a publisher does not print in French
 * (Riftbound, the newest Yu-Gi-Oh! cards). They live apart from the card database — which each ingest
 * rebuilds — in `.data/translations-<game>.db`, keyed by the hash of the
 * English words, so a card is translated once and an edited one again.
 *
 * `applyTranslations` writes a French row beside each English one it has a
 * translation for: same card, translated name, text and flavour, marked as
 * such (`extra.translated`), the English words kept (`name_en`, `extra.textEn`).
 */
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient } from '@libsql/client'
import { fold } from './schema.mjs'

export function translationsDb(path) {
  mkdirSync(dirname(path), { recursive: true })
  return createClient({ url: `file:${path}` })
}

export async function ensureTranslations(tdb) {
  await tdb.execute(`CREATE TABLE IF NOT EXISTS translations (
    hash TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    text TEXT,
    flavour TEXT,
    model TEXT,
    at TEXT
  )`)
}

/** What is translated of a card, and its key. */
export function sourceOf(row) {
  const extra = JSON.parse(String(row.extra ?? '{}'))
  const src = { name: String(row.name), text: row.text == null ? null : String(row.text), flavour: extra.flavour ?? null }
  const hash = createHash('sha1').update(JSON.stringify(src)).digest('hex')
  return { hash, ...src }
}

/**
 * A French row beside every English one the cache has a translation for.
 * `onlyMissing`: the game has official French rows, kept; only the cards with
 * none get a translated one.
 */
export async function applyTranslations(db, tdb, { onlyMissing = false } = {}) {
  await ensureTranslations(tdb)
  const { rows: tr } = await tdb.execute('SELECT hash, name, text, flavour FROM translations')
  const byHash = new Map(tr.map(r => [String(r.hash), r]))
  if (!byHash.size)
    return 0
  // Translations of a previous run go; official French rows stay.
  await db.execute(onlyMissing ? 'DELETE FROM cards WHERE lang = \'fr\' AND extra LIKE \'%"translated":true%\'' : 'DELETE FROM cards WHERE lang = \'fr\'')
  const { rows } = await db.execute(onlyMissing
    ? 'SELECT * FROM cards e WHERE lang = \'en\' AND NOT EXISTS (SELECT 1 FROM cards f WHERE f.card_key = e.card_key AND f.lang = \'fr\')'
    : 'SELECT * FROM cards WHERE lang = \'en\'')
  const inserts = []
  for (const r of rows) {
    const src = sourceOf(r)
    const t = byHash.get(src.hash)
    if (!t)
      continue
    const extra = JSON.parse(String(r.extra ?? '{}'))
    const cols = Object.keys(r).filter(k => Number.isNaN(Number(k)))
    const values = {
      ...Object.fromEntries(cols.map(k => [k, r[k]])),
      lang: 'fr',
      name: String(t.name),
      name_en: src.name,
      name_folded: fold(String(t.name)),
      text: t.text == null ? r.text : String(t.text),
      extra: JSON.stringify({ ...extra, flavour: t.flavour ?? extra.flavour ?? null, translated: true, textEn: r.text ?? null, flavourEn: extra.flavour ?? null }),
    }
    inserts.push({
      sql: `INSERT OR REPLACE INTO cards (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      args: cols.map(k => values[k] ?? null),
    })
  }
  for (let i = 0; i < inserts.length; i += 500)
    await db.batch(inserts.slice(i, i + 500), 'write')
  // The sets in French too (their names are the same, English).
  await db.execute(`INSERT OR ${onlyMissing ? 'IGNORE' : 'REPLACE'} INTO sets (code, lang, name, abbr, series, released, total, symbol, logo, signature)
                    SELECT code, 'fr', name, abbr, series, released, total, symbol, logo, signature FROM sets WHERE lang = 'en'`)
  return inserts.length
}
