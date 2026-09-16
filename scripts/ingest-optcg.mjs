#!/usr/bin/env node
/**
 * One Piece Card Game ingestion — punk-records → local SQLite.
 *
 * Source: https://github.com/buhbbl/punk-records — a static, versioned JSON
 * dataset regenerated weekly by `vegapull` (which scrapes Bandai's official card
 * list). We consume the published JSON rather than running the scraper at build
 * time: no Rust toolchain, no hammering Bandai, and a dataset that is either
 * there or not, never half-scraped. vegapull stays the fallback if it goes stale.
 *
 * Both languages are ingested. French is 23 packs behind English (Bandai's own
 * release schedule, not a tooling gap), so the English row is the fallback
 * whenever a card has no French printing — the same bilingual problem as Magic.
 *
 * Output: `.data/cards-optcg.db`, separate from the Magic database so either can
 * be rebuilt without touching the other.
 *
 * Usage:  node scripts/ingest-optcg.mjs [--force]
 */
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = resolve(ROOT, '.data')
const FINAL_DB = resolve(DATA_DIR, 'cards-optcg.db')
const TMP_DB = resolve(DATA_DIR, 'cards-optcg-new.db')

const BASE = 'https://raw.githubusercontent.com/buhbbl/punk-records/main'
const LANGS = { french: 'fr', english: 'en' }
const UA = 'SpellForge/0.3.2 (+https://github.com/Diix46/SpellForge)'

// Banned as of the 2026-04-10 list. Pair bans (EB04-058 + OP07-115,
// OP11-040 + OP11-067, OP11-040 + OP08-069) are deck-level constraints, not
// card properties — they belong to the rules engine, not this table.
const BANNED = new Set(['OP06-116', 'ST10-001', 'OP06-086', 'OP03-040', 'OP06-047'])

const COLOR_BIT = { Red: 1, Green: 2, Blue: 4, Purple: 8, Black: 16, Yellow: 32 }

const force = process.argv.includes('--force')
const log = (...a) => console.log(...a)

async function getJson(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: { 'User-Agent': UA } })
  if (!res.ok)
    throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

/** Bounded concurrency — be a good citizen towards raw.githubusercontent.com. */
async function mapPool(items, limit, fn) {
  const out = []
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const n = i++
      out[n] = await fn(items[n], n)
    }
  }))
  return out
}

/** `OP01-001` → `OP-01`, `ST13-002` → `ST-13`, `PRB01-004` → `PRB-01`. */
function setCode(cardNumber) {
  const m = /^([A-Z]+)(\d+)-/.exec(cardNumber)
  return m ? `${m[1]}-${m[2]}` : cardNumber.split('-')[0]
}

function mask(colors) {
  let m = 0
  for (const c of colors || []) m |= COLOR_BIT[c] || 0
  return m
}

/**
 * Bandai appends a cache-buster that changes on every dataset regeneration.
 *  Store the marker, never the URL — the host differs per locale and the URL
 *  is revocable, so it is rebuilt at render time from id + locale + version.
 */
function imgVersion(url) {
  const m = url && /\?(\d+)/.exec(url)
  return m ? m[1] : null
}

const SCHEMA = [
  `CREATE TABLE op_cards (
     id            TEXT NOT NULL,
     lang          TEXT NOT NULL,
     card_number   TEXT NOT NULL,
     name          TEXT NOT NULL,
     name_folded   TEXT NOT NULL,
     category      TEXT NOT NULL,
     rarity        TEXT,
     colors        TEXT,
     color_mask    INTEGER NOT NULL DEFAULT 0,
     pack_id       TEXT,
     set_code      TEXT,
     block_number  INTEGER,
     cost          INTEGER,
     life          INTEGER,
     power         INTEGER,
     counter       INTEGER,
     attributes    TEXT,
     types         TEXT,
     effect        TEXT,
     trigger_text  TEXT,
     is_banned     INTEGER NOT NULL DEFAULT 0,
     img_version   TEXT,
     PRIMARY KEY (id, lang)
   )`,
  `CREATE TABLE op_packs (
     id    TEXT NOT NULL,
     lang  TEXT NOT NULL,
     label TEXT,
     title TEXT,
     PRIMARY KEY (id, lang)
   )`,
  `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)`,
]

const INDEXES = [
  `CREATE INDEX idx_op_number   ON op_cards(card_number, lang)`,
  `CREATE INDEX idx_op_name     ON op_cards(name_folded)`,
  `CREATE INDEX idx_op_browse   ON op_cards(lang, category, color_mask)`,
  `CREATE INDEX idx_op_set      ON op_cards(set_code, lang)`,
  `CREATE INDEX idx_op_block    ON op_cards(block_number)`,
]

// \p{M} = every Unicode combining mark, which is exactly what NFD splits accents
// into. Safer than spelling out the combining-mark code point range, which lint
// flags as obscure.
const fold = s => (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

async function ingestLang(db, lang, code) {
  const manifest = await getJson(`${lang}/manifest.json`)
  const packs = await getJson(`${lang}/packs.json`)
  const ids = Object.keys(packs)
  log(`  ${code} · ${ids.length} extensions · dataset du ${new Date(manifest.generated_at * 1000).toISOString().slice(0, 10)}`)

  const packRows = ids.map(id => [id, code, packs[id]?.title_parts?.label ?? null, packs[id]?.raw_title ?? null])
  await db.execute({
    sql: `INSERT OR REPLACE INTO op_packs (id,lang,label,title) VALUES ${packRows.map(() => '(?,?,?,?)').join(',')}`,
    args: packRows.flat(),
  })

  const perPack = await mapPool(ids, 6, async (id) => {
    try {
      return await getJson(`${lang}/data/${id}.json`)
    }
    catch {
      log(`    ⚠ extension ${id} illisible, ignorée`)
      return []
    }
  })

  const rows = []
  for (const cards of perPack) {
    for (const c of cards) {
      // Parallel arts (`_p1`) are the SAME card for the 4-copy rule.
      const cardNumber = String(c.id).replace(/_p\d+$/, '')
      // punk-records stores a Leader's Life in `cost`; there is no `life` field.
      const isLeader = c.category === 'Leader'
      rows.push([
        c.id,
        code,
        cardNumber,
        c.name || '',
        fold(c.name),
        c.category || '',
        c.rarity ?? null,
        JSON.stringify(c.colors ?? []),
        mask(c.colors),
        c.pack_id ?? null,
        setCode(cardNumber),
        c.block_number ?? null,
        isLeader ? null : (c.cost ?? null),
        isLeader ? (c.cost ?? null) : null,
        c.power ?? null,
        c.counter ?? null,
        JSON.stringify(c.attributes ?? []),
        JSON.stringify(c.types ?? []),
        c.effect ?? null,
        c.trigger ?? null,
        BANNED.has(cardNumber) ? 1 : 0,
        imgVersion(c.img_full_url),
      ])
    }
  }

  const COLS = 22
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400)
    await db.execute({
      sql: `INSERT OR REPLACE INTO op_cards (id,lang,card_number,name,name_folded,category,rarity,colors,color_mask,pack_id,set_code,block_number,cost,life,power,counter,attributes,types,effect,trigger_text,is_banned,img_version)
            VALUES ${chunk.map(() => `(${Array.from({ length: COLS }).fill('?').join(',')})`).join(',')}`,
      args: chunk.flat(),
    })
  }

  // Report what actually landed, not what we tried to insert: the source ships a
  // handful of duplicate ids that INSERT OR REPLACE collapses.
  const inserted = Number(Object.values((await db.execute({
    sql: `SELECT COUNT(*) FROM op_cards WHERE lang = ?`,
    args: [code],
  })).rows[0])[0])
  log(`     ${inserted.toLocaleString('fr-FR')} cartes`)
  return { generatedAt: manifest.generated_at, packs: ids.length, cards: inserted }
}

async function main() {
  const t0 = Date.now()
  if (!existsSync(DATA_DIR))
    mkdirSync(DATA_DIR, { recursive: true })

  log('\nIngestion One Piece — punk-records\n')

  if (!force && existsSync(FINAL_DB)) {
    const cur = await getJson('french/manifest.json')
    const db = createClient({ url: `file:${FINAL_DB}` })
    const r = await db.execute({ sql: `SELECT value FROM meta WHERE key='generated_at_fr'`, args: [] })
    db.close()
    if (r.rows[0]?.value === String(cur.generated_at)) {
      log('  base déjà à jour — rien à faire (--force pour reconstruire)\n')
      return
    }
  }

  rmSync(TMP_DB, { force: true })
  const db = createClient({ url: `file:${TMP_DB}` })
  await db.execute('PRAGMA journal_mode = WAL')
  for (const sql of SCHEMA) await db.execute(sql)

  const stats = {}
  for (const [lang, code] of Object.entries(LANGS)) stats[code] = await ingestLang(db, lang, code)

  // English is the source of truth for everything numeric. Gameplay values are
  // language-invariant — only name/effect/trigger/types are translated — and
  // Bandai's localised pages are occasionally malformed (ST13-001_p1 FR ships
  // with no cost, no life and a power of 4). Rather than patching that one card,
  // overwrite every gameplay column from the English row wherever one exists, so
  // no localised data corruption can ever reach the rules engine.
  log('  · alignement des valeurs de jeu sur l\'anglais')
  await db.execute(`
    UPDATE op_cards AS t
       SET cost         = (SELECT e.cost         FROM op_cards e WHERE e.id = t.id AND e.lang = 'en'),
           life         = (SELECT e.life         FROM op_cards e WHERE e.id = t.id AND e.lang = 'en'),
           power        = (SELECT e.power        FROM op_cards e WHERE e.id = t.id AND e.lang = 'en'),
           counter      = (SELECT e.counter      FROM op_cards e WHERE e.id = t.id AND e.lang = 'en'),
           block_number = (SELECT e.block_number FROM op_cards e WHERE e.id = t.id AND e.lang = 'en'),
           colors       = (SELECT e.colors       FROM op_cards e WHERE e.id = t.id AND e.lang = 'en'),
           color_mask   = (SELECT e.color_mask   FROM op_cards e WHERE e.id = t.id AND e.lang = 'en'),
           category     = (SELECT e.category     FROM op_cards e WHERE e.id = t.id AND e.lang = 'en'),
           rarity       = (SELECT e.rarity       FROM op_cards e WHERE e.id = t.id AND e.lang = 'en')
     WHERE t.lang <> 'en'
       AND EXISTS (SELECT 1 FROM op_cards e WHERE e.id = t.id AND e.lang = 'en')`)

  log('  · index')
  for (const sql of INDEXES) await db.execute(sql)

  log('  · index plein texte')
  await db.execute(`CREATE VIRTUAL TABLE op_search USING fts5(
                      id UNINDEXED, lang UNINDEXED, name_folded, effect, types,
                      tokenize="unicode61 remove_diacritics 2")`)
  await db.execute(`INSERT INTO op_search (id,lang,name_folded,effect,types)
                    SELECT id, lang, name_folded, COALESCE(effect,''), COALESCE(types,'') FROM op_cards`)

  for (const [code, s] of Object.entries(stats)) {
    await db.execute({ sql: `INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)`, args: [`generated_at_${code}`, String(s.generatedAt)] })
  }
  await db.execute({ sql: `INSERT OR REPLACE INTO meta (key,value) VALUES ('ingested_at',?)`, args: [new Date().toISOString()] })

  await db.execute('VACUUM')
  await db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
  await db.execute('PRAGMA journal_mode = DELETE')
  db.close()

  for (const ext of ['', '-wal', '-shm']) rmSync(`${FINAL_DB}${ext}`, { force: true })
  renameSync(TMP_DB, FINAL_DB)
  for (const ext of ['-wal', '-shm']) rmSync(`${TMP_DB}${ext}`, { force: true })

  log(`\n  ✔ ${FINAL_DB.replace(`${ROOT}/`, '')} — ${(statSync(FINAL_DB).size / 1048576).toFixed(1)} Mo`)
  log(`    ${Object.entries(stats).map(([c, s]) => `${c} ${s.cards.toLocaleString('fr-FR')} cartes / ${s.packs} extensions`).join(' · ')}`)
  log(`    ${((Date.now() - t0) / 1000).toFixed(1)} s au total\n`)
}

main().catch((e) => {
  console.error('\n✖ ingestion échouée :', e.message)
  process.exitCode = 1
})
