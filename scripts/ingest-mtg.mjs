#!/usr/bin/env node
/**
 * Magic card ingestion — Scryfall bulk `all_cards` → local SQLite.
 *
 * Replaces every runtime call to api.scryfall.com. Streams the gzipped JSONL
 * bulk file (375 MB compressed / 2.7 GB raw / ~542k lines) without ever holding
 * it in memory, keeps only the languages we serve, and writes a self-contained
 * card database.
 *
 * Output is `.data/cards.db` — deliberately SEPARATE from `.data/spellforge.db`.
 * The card DB is a rebuildable cache (drop it, re-run, done); the app DB holds
 * irreplaceable user data. Keeping them apart means an ingest can never corrupt
 * a deck, and the card DB can be swapped atomically while the app is running.
 *
 * Usage:  node scripts/ingest-mtg.mjs [--force]
 *
 * NOTE (July 2026 API change): Scryfall removed `download_uri` and `size` from
 * bulk-data objects. The fields are now `jsonl_download_uri` + `compressed_size`
 * and the payload is gzipped JSONL, one card object per line. Anything written
 * against the old array-JSON format is dead.
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { createGunzip } from 'node:zlib'
import { createClient } from '@libsql/client'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = resolve(ROOT, '.data')
// One database per game. The ingest rebuilds from scratch and swaps atomically,
// so a shared file would mean every Magic refresh silently wiping One Piece.
const FINAL_DB = resolve(DATA_DIR, 'cards-mtg.db')
const TMP_DB = resolve(DATA_DIR, 'cards-mtg-new.db')
const TMP_GZ = resolve(DATA_DIR, 'all-cards.jsonl.gz')

// Only these are ever requested by the app (site locale is FR or EN).
// Ingesting every language would take the DB from ~240 MB to ~700 MB.
const LANGS = new Set(['en', 'fr'])

const UA = 'SpellForge/0.3.2 (+https://github.com/Diix46/SpellForge)'
const COLOR_BIT = { W: 1, U: 2, B: 4, R: 8, G: 16 }

// Scryfall hides these from search by default. Mirror that, or our result
// counts silently diverge from everyone's expectations.
const EXTRA_LAYOUTS = new Set(['art_series', 'token', 'double_faced_token', 'emblem', 'scheme', 'planar', 'vanguard'])
const EXTRA_SET_TYPES = new Set(['memorabilia', 'token', 'minigame'])

const force = process.argv.includes('--force')
const log = (...a) => console.log(...a)
const mb = n => `${(n / 1048576).toFixed(1)} MB`

// ─── helpers ───────────────────────────────────────────────────────────────

/** Accent-insensitive, case-insensitive key used for exact + prefix matching. */
function fold(s) {
  // \p{M} = every Unicode combining mark, which is exactly what NFD splits
  // accents into. Safer than a literal ̀-ͯ range, flagged as obscure.
  return (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/** WUBRG array → 5-bit mask. Turns `id<=` / `color>=` into one indexed integer test. */
function mask(colors) {
  let m = 0
  for (const c of colors || []) m |= COLOR_BIT[c] || 0
  return m
}

/**
 * Scryfall appends a cache-buster matching the image's last update. Keep the
 *  number, drop the URL: image URLs are fully derivable from id + this value,
 *  and storing all 11 variants costs ~400 MB (62% of the database).
 */
function imgVersion(card) {
  const u = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal
  const m = u && /\?(\d+)/.exec(u)
  return m ? m[1] : null
}

function hasRealImage(card) {
  const has = !!(card.image_uris || card.card_faces?.[0]?.image_uris)
  return has && card.image_status !== 'placeholder' && card.image_status !== 'missing' ? 1 : 0
}

const num = v => (v === undefined || v === null || v === '' ? null : Number(v))

// ─── batched writer ────────────────────────────────────────────────────────
// One multi-row INSERT per flush inside an explicit transaction. Row-at-a-time
// execute() would spend the whole run in round-trip overhead.
class Batch {
  constructor(db, table, columns, size = 500) {
    this.db = db
    this.table = table
    this.columns = columns
    this.size = size
    this.rows = []
    this.count = 0
  }

  async push(row) {
    this.rows.push(row)
    if (this.rows.length >= this.size)
      await this.flush()
  }

  async flush() {
    if (!this.rows.length)
      return
    const ph = `(${this.columns.map(() => '?').join(',')})`
    const sql = `INSERT OR REPLACE INTO ${this.table} (${this.columns.join(',')}) VALUES ${this.rows.map(() => ph).join(',')}`
    await this.db.execute({ sql, args: this.rows.flat() })
    this.count += this.rows.length
    this.rows = []
  }
}

// ─── schema ────────────────────────────────────────────────────────────────

const SCHEMA = [
  `CREATE TABLE oracle_cards (
     oracle_id       TEXT PRIMARY KEY,
     name            TEXT NOT NULL,
     name_folded     TEXT NOT NULL,
     name_front      TEXT NOT NULL,
     type_line       TEXT,
     oracle_text     TEXT,
     mana_cost       TEXT,
     cmc             REAL,
     layout          TEXT,
     keywords        TEXT,
     colors_mask     INTEGER NOT NULL DEFAULT 0,
     identity_mask   INTEGER NOT NULL DEFAULT 0,
     legal_commander INTEGER NOT NULL DEFAULT 0,
     is_commander    INTEGER NOT NULL DEFAULT 0,
     is_funny        INTEGER NOT NULL DEFAULT 0,
     is_extra        INTEGER NOT NULL DEFAULT 0,
     edhrec_rank     INTEGER,
     min_price_eur   REAL,
     -- Sortable twins of the two nullable columns above. ORDER BY on a nullable
     -- column needs an IS NULL guard to keep unranked cards off the top, and
     -- that guard is an expression no index can serve — it cost a TEMP B-TREE
     -- over 24 000 rows on every browse. Here NULL becomes a high sentinel, so
     -- ordering is a plain indexed walk. Populated in finalize().
     edhrec_sort     INTEGER NOT NULL DEFAULT 2147483647,
     price_sort      REAL NOT NULL DEFAULT 999999
   )`,
  `CREATE TABLE printings (
     id               TEXT PRIMARY KEY,
     oracle_id        TEXT NOT NULL,
     lang             TEXT NOT NULL,
     set_code         TEXT NOT NULL,
     set_name         TEXT,
     collector_number TEXT NOT NULL,
     released_at      TEXT,
     rarity           TEXT,
     promo            INTEGER NOT NULL DEFAULT 0,
     image_status     TEXT,
     is_real_image    INTEGER NOT NULL DEFAULT 0,
     is_highres       INTEGER NOT NULL DEFAULT 0,
     printed_name     TEXT,
     printed_type_line TEXT,
     printed_text     TEXT,
     price_eur        REAL,
     img_version      TEXT,
     artist           TEXT
   )`,
  `CREATE TABLE card_faces (
     printing_id       TEXT NOT NULL,
     face_index        INTEGER NOT NULL,
     name              TEXT,
     printed_name      TEXT,
     type_line         TEXT,
     printed_type_line TEXT,
     mana_cost         TEXT,
     oracle_text       TEXT,
     printed_text      TEXT,
     img_version       TEXT,
     PRIMARY KEY (printing_id, face_index)
   )`,
  `CREATE TABLE card_parts (
     oracle_id    TEXT NOT NULL,
     related_name TEXT NOT NULL
   )`,
  // Which printing to show for a card in a given language, resolved once here
  // instead of on every search. Doing it in the query needed an ORDER BY on
  // `(lang = ?)`, which no index can serve: the default browse cost 168 ms.
  // One row per (card, served language); the English fallback is already baked
  // in, so the search never has to express "or else English".
  `CREATE TABLE best_printings (
     oracle_id   TEXT NOT NULL,
     lang        TEXT NOT NULL,
     printing_id TEXT NOT NULL,
     PRIMARY KEY (oracle_id, lang)
   )`,
  `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)`,
]

const INDEXES = [
  `CREATE INDEX idx_oracle_name    ON oracle_cards(name_folded)`,
  `CREATE INDEX idx_oracle_front   ON oracle_cards(name_front)`,
  // cmc is 0..16, so this composite covers "cmc<=N sorted by popularity" —
  // a range predicate on one column with ORDER BY on another, the shape that
  // otherwise forces a full sort.
  `CREATE INDEX idx_oracle_cmc_rank ON oracle_cards(cmc, edhrec_rank)`,
  `CREATE INDEX idx_oracle_rank    ON oracle_cards(edhrec_rank)`,
  `CREATE INDEX idx_oracle_ident   ON oracle_cards(identity_mask)`,
  `CREATE INDEX idx_oracle_price   ON oracle_cards(min_price_eur)`,
  // The default browse: three constant filters then popularity order. Equality
  // columns first, the ordered column last — that shape lets SQLite walk the
  // index already sorted and stop at LIMIT, instead of sorting the whole set.
  // Only works because edhrec_sort is non-null; see the schema comment.
  `CREATE INDEX idx_oracle_browse  ON oracle_cards(legal_commander, is_funny, is_extra, edhrec_sort)`,
  `CREATE INDEX idx_oracle_browse_price ON oracle_cards(legal_commander, is_funny, is_extra, price_sort)`,
  // Serves the one-off best-printing resolution below, and the direct
  // "best printing of this card in this language" lookup — the query that
  // collapses five chained network calls into one.
  `CREATE INDEX idx_print_best     ON printings(oracle_id, lang, is_real_image, is_highres)`,
  `CREATE UNIQUE INDEX idx_print_pin ON printings(set_code, collector_number, lang)`,
  `CREATE INDEX idx_print_released ON printings(oracle_id, released_at DESC)`,
  `CREATE INDEX idx_parts_oracle   ON card_parts(oracle_id)`,
]

// ─── step 1 — bulk metadata ────────────────────────────────────────────────

async function fetchBulkMeta() {
  const res = await fetch('https://api.scryfall.com/bulk-data/all_cards', {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  })
  if (!res.ok)
    throw new Error(`bulk-data: HTTP ${res.status}`)
  const b = await res.json()
  return { uri: b.jsonl_download_uri, size: b.compressed_size, updatedAt: b.updated_at }
}

/**
 * The 3.4 KB metadata response IS the change check. The download URL carries a
 *  timestamp so conditional GETs can never hit — compare `updated_at` instead.
 */
async function alreadyCurrent(updatedAt) {
  if (force || !existsSync(FINAL_DB))
    return false
  try {
    const db = createClient({ url: `file:${FINAL_DB}` })
    const r = await db.execute({ sql: `SELECT value FROM meta WHERE key='bulk_updated_at'`, args: [] })
    return r.rows[0]?.value === updatedAt
  }
  catch { return false }
}

// ─── step 2 — download ─────────────────────────────────────────────────────

async function download(uri, expected) {
  log(`  ↓ ${uri.split('/').pop()}  (${mb(expected)})`)
  const t0 = Date.now()
  const res = await fetch(uri, { headers: { 'User-Agent': UA } })
  if (!res.ok)
    throw new Error(`download: HTTP ${res.status}`)

  let got = 0
  let lastPct = -1
  const src = Readable.fromWeb(res.body)
  src.on('data', (c) => {
    got += c.length
    const pct = Math.floor((got / expected) * 100 / 10) * 10
    if (pct > lastPct && pct <= 100) {
      lastPct = pct
      process.stdout.write(`\r    ${pct}%`)
    }
  })
  await pipeline(src, createWriteStream(TMP_GZ))
  process.stdout.write(`\r    100%  en ${((Date.now() - t0) / 1000).toFixed(1)} s\n`)
}

// ─── step 3 — stream + insert ──────────────────────────────────────────────

async function ingest(db) {
  const oracles = new Batch(db, 'oracle_cards', [
    'oracle_id',
    'name',
    'name_folded',
    'name_front',
    'type_line',
    'oracle_text',
    'mana_cost',
    'cmc',
    'layout',
    'keywords',
    'colors_mask',
    'identity_mask',
    'legal_commander',
    'is_commander',
    'is_funny',
    'is_extra',
    'edhrec_rank',
  ])
  const prints = new Batch(db, 'printings', [
    'id',
    'oracle_id',
    'lang',
    'set_code',
    'set_name',
    'collector_number',
    'released_at',
    'rarity',
    'promo',
    'image_status',
    'is_real_image',
    'is_highres',
    'printed_name',
    'printed_type_line',
    'printed_text',
    'price_eur',
    'img_version',
    'artist',
  ])
  const faces = new Batch(db, 'card_faces', [
    'printing_id',
    'face_index',
    'name',
    'printed_name',
    'type_line',
    'printed_type_line',
    'mana_cost',
    'oracle_text',
    'printed_text',
    'img_version',
  ])
  const parts = new Batch(db, 'card_parts', ['oracle_id', 'related_name'])

  const seenOracle = new Set()
  const seenPin = new Set()
  let lines = 0
  let kept = 0
  const byLang = {}
  const t0 = Date.now()

  const rl = readline.createInterface({
    input: createReadStream(TMP_GZ).pipe(createGunzip()),
    crlfDelay: Infinity,
  })

  await db.execute('BEGIN')

  for await (const line of rl) {
    lines++
    if (lines % 100000 === 0) {
      await db.execute('COMMIT')
      await db.execute('BEGIN')
      process.stdout.write(`\r    ${lines.toLocaleString('fr-FR')} lignes lues · ${kept.toLocaleString('fr-FR')} gardées`)
    }
    if (!line)
      continue

    let c
    try {
      c = JSON.parse(line)
    }
    catch {
      continue
    }

    if (!LANGS.has(c.lang))
      continue

    // Reversible cards carry oracle_id on the faces rather than the top level.
    const oracleId = c.oracle_id || c.card_faces?.[0]?.oracle_id
    if (!oracleId)
      continue

    kept++
    byLang[c.lang] = (byLang[c.lang] || 0) + 1

    const face0 = c.card_faces?.[0]

    if (!seenOracle.has(oracleId)) {
      seenOracle.add(oracleId)
      // Oracle-level fields are language-invariant in Scryfall (the localized
      // text lives in printed_*), so the first row we meet is authoritative.
      const typeLine = c.type_line ?? face0?.type_line ?? null
      const oracleText = c.oracle_text ?? face0?.oracle_text ?? null
      const legal = c.legalities?.commander === 'legal' ? 1 : 0
      // ~91% recall against Scryfall's own is:commander — Backgrounds and
      // partner variants need a hand-maintained exception list on top.
      const isCmd = legal && (/Legendary.*Creature/i.test(typeLine || '')
        || /can be your commander/i.test(oracleText || ''))
        ? 1
        : 0
      const name = c.name || ''

      await oracles.push([
        oracleId,
        name,
        fold(name),
        fold(name.split(' // ')[0]),
        typeLine,
        oracleText,
        c.mana_cost ?? face0?.mana_cost ?? null,
        num(c.cmc) ?? 0,
        c.layout || null,
        c.keywords?.length ? JSON.stringify(c.keywords) : null,
        mask(c.colors ?? face0?.colors),
        mask(c.color_identity),
        legal,
        isCmd,
        c.set_type === 'funny' ? 1 : 0,
        (EXTRA_LAYOUTS.has(c.layout) || EXTRA_SET_TYPES.has(c.set_type)) ? 1 : 0,
        c.edhrec_rank ?? null,
      ])

      for (const p of c.all_parts || []) {
        if (p.component === 'token' && p.name)
          await parts.push([oracleId, p.name])
      }
    }

    // The pinned-printing key must stay unique; Scryfall has a handful of
    // duplicate (set, number, lang) triples across promo variants.
    const pin = `${c.set}/${c.collector_number}/${c.lang}`
    if (seenPin.has(pin))
      continue
    seenPin.add(pin)

    await prints.push([
      c.id,
      oracleId,
      c.lang,
      c.set,
      c.set_name || null,
      c.collector_number,
      c.released_at || null,
      c.rarity || null,
      c.promo ? 1 : 0,
      c.image_status || null,
      hasRealImage(c),
      c.image_status === 'highres_scan' ? 1 : 0,
      c.printed_name ?? face0?.printed_name ?? null,
      c.printed_type_line ?? face0?.printed_type_line ?? null,
      c.printed_text ?? face0?.printed_text ?? null,
      num(c.prices?.eur),
      imgVersion(c),
      c.artist || null,
    ])

    if (c.card_faces?.length) {
      for (let i = 0; i < Math.min(2, c.card_faces.length); i++) {
        const f = c.card_faces[i]
        const u = f.image_uris?.normal
        const m = u && /\?(\d+)/.exec(u)
        await faces.push([
          c.id,
          i,
          f.name || null,
          f.printed_name || null,
          f.type_line || null,
          f.printed_type_line || null,
          f.mana_cost || null,
          f.oracle_text || null,
          f.printed_text || null,
          m ? m[1] : null,
        ])
      }
    }
  }

  await oracles.flush()
  await prints.flush()
  await faces.flush()
  await parts.flush()
  await db.execute('COMMIT')

  process.stdout.write(`${'\r'.padEnd(70)}\r`)
  log(`    ${lines.toLocaleString('fr-FR')} lignes lues en ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  log(`    gardé ${kept.toLocaleString('fr-FR')} impressions — ${Object.entries(byLang).map(([k, v]) => `${k} ${v.toLocaleString('fr-FR')}`).join(' · ')}`)
  log(`    ${seenOracle.size.toLocaleString('fr-FR')} cartes distinctes, ${parts.count} jetons associés`)
  return { lines, kept, oracles: seenOracle.size }
}

// ─── step 4 — derive, index, search ────────────────────────────────────────

async function finalize(db, meta) {
  log('  · index')
  for (const sql of INDEXES) await db.execute(sql)

  // Only 1.9% of French printings carry a EUR price. Filtering on the French
  // row's own price would drop 98% of the catalogue; rolling the cheapest
  // printing up to the card restores 99.8% coverage.
  log('  · rollup des prix')
  await db.execute(`UPDATE oracle_cards
                    SET min_price_eur = (SELECT MIN(p.price_eur) FROM printings p
                                         WHERE p.oracle_id = oracle_cards.oracle_id
                                           AND p.price_eur IS NOT NULL)`)

  // Collapse "unranked" and "unpriced" into high sentinels so ORDER BY never
  // needs an IS NULL guard. That guard is an expression, and an expression at
  // the head of an ORDER BY defeats every index — it was costing a TEMP B-TREE
  // over 24 000 rows on the most frequent query in the app. Must run after the
  // rollup above, since price_sort reads min_price_eur.
  log('  · colonnes de tri')
  await db.execute(`UPDATE oracle_cards
                    SET edhrec_sort = COALESCE(edhrec_rank, 2147483647),
                        price_sort  = COALESCE(min_price_eur, 999999)`)

  log('  · index plein texte')
  await db.execute(`CREATE VIRTUAL TABLE card_search USING fts5(
                      oracle_id UNINDEXED, name_folded, printed_name,
                      oracle_text, printed_text, type_line,
                      tokenize="unicode61 remove_diacritics 2")`)
  // One FTS row per card, carrying the French printed strings so a French user
  // searching "Voix des Praetors" hits the same row as "Praetors' Voice".
  await db.execute(`INSERT INTO card_search (oracle_id, name_folded, printed_name, oracle_text, printed_text, type_line)
                    SELECT o.oracle_id, o.name_folded,
                           (SELECT p.printed_name FROM printings p
                             WHERE p.oracle_id = o.oracle_id AND p.lang='fr' AND p.printed_name IS NOT NULL LIMIT 1),
                           o.oracle_text,
                           (SELECT p.printed_text FROM printings p
                             WHERE p.oracle_id = o.oracle_id AND p.lang='fr' AND p.printed_text IS NOT NULL LIMIT 1),
                           o.type_line
                    FROM oracle_cards o`)

  // Resolve the displayed printing per language, set-based. ROW_NUMBER ranks
  // every candidate printing once; the search then only ever does an equality
  // lookup on the primary key.
  log('  · résolution des impressions par langue')
  for (const lang of LANGS) {
    await db.execute({
      sql: `INSERT OR REPLACE INTO best_printings (oracle_id, lang, printing_id)
            SELECT oracle_id, ?, id FROM (
              SELECT p.oracle_id, p.id,
                     ROW_NUMBER() OVER (
                       PARTITION BY p.oracle_id
                       ORDER BY (p.lang = ?) DESC, p.is_highres DESC, p.released_at DESC
                     ) AS rn
                FROM printings p
               WHERE p.lang IN (?, 'en') AND p.is_real_image = 1
            ) WHERE rn = 1`,
      args: [lang, lang, lang],
    })
  }

  await db.execute({ sql: `INSERT OR REPLACE INTO meta (key,value) VALUES ('bulk_updated_at',?)`, args: [meta.updatedAt] })
  await db.execute({ sql: `INSERT OR REPLACE INTO meta (key,value) VALUES ('ingested_at',?)`, args: [new Date().toISOString()] })

  log('  · VACUUM')
  await db.execute('VACUUM')
}

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now()
  if (!existsSync(DATA_DIR))
    mkdirSync(DATA_DIR, { recursive: true })

  log('\nIngestion Magic — Scryfall bulk `all_cards`\n')

  const meta = await fetchBulkMeta()
  log(`  source mise à jour le ${meta.updatedAt.slice(0, 16).replace('T', ' à ')} UTC`)

  if (await alreadyCurrent(meta.updatedAt)) {
    log('  base déjà à jour — rien à faire (--force pour reconstruire)\n')
    return
  }

  if (!existsSync(TMP_GZ) || force)
    await download(meta.uri, meta.size)
  else log(`  ↓ archive déjà présente (${mb(meta.size)}), réutilisée`)

  rmSync(TMP_DB, { force: true })
  const db = createClient({ url: `file:${TMP_DB}` })
  await db.execute('PRAGMA journal_mode = WAL')
  await db.execute('PRAGMA synchronous = OFF')
  for (const sql of SCHEMA) await db.execute(sql)

  log('  · lecture du flux')
  const stats = await ingest(db)
  await finalize(db, meta)
  // Fold the WAL back into the main file before swapping. Renaming a WAL-mode
  // database without checkpointing leaves its -wal behind and loses the tail
  // of the write — the classic way to ship a half-empty card database.
  await db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
  await db.execute('PRAGMA journal_mode = DELETE')
  db.close()

  // Atomic swap on the same filesystem — the running app never sees a half-built DB.
  for (const ext of ['', '-wal', '-shm']) rmSync(`${FINAL_DB}${ext}`, { force: true })
  renameSync(TMP_DB, FINAL_DB)
  for (const ext of ['-wal', '-shm']) rmSync(`${TMP_DB}${ext}`, { force: true })
  rmSync(TMP_GZ, { force: true })

  log(`\n  ✔ ${FINAL_DB.replace(`${ROOT}/`, '')} — ${mb(statSync(FINAL_DB).size)}`)
  log(`    ${stats.oracles.toLocaleString('fr-FR')} cartes · ${stats.kept.toLocaleString('fr-FR')} impressions · ${((Date.now() - t0) / 1000).toFixed(1)} s au total\n`)
}

main().catch((e) => {
  console.error('\n✖ ingestion échouée :', e.message)
  process.exitCode = 1
})
