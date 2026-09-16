#!/usr/bin/env node
/**
 * Magic card ingestion — Scryfall bulk `all_cards` → local SQLite.
 *
 * Replaces every runtime call to api.scryfall.com. Streams the gzipped JSONL
 * bulk file (375 MB compressed / 2.7 GB raw / ~542k lines) without ever holding
 * it in memory, keeps only the languages we serve, and writes a self-contained
 * card database.
 *
 * Output is `.data/cards-mtg.db` — deliberately SEPARATE from `.data/spellforge.db`.
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
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
// MTG_CARDS_DB moves the database, as it does for the server (relative to the
// working directory). The build happens beside it: rename() needs one filesystem.
const FINAL_DB = process.env.MTG_CARDS_DB ? resolve(process.env.MTG_CARDS_DB) : resolve(DATA_DIR, 'cards-mtg.db')
const TMP_DB = resolve(dirname(FINAL_DB), 'cards-mtg-new.db')
const TMP_GZ = resolve(DATA_DIR, 'all-cards.jsonl.gz')
// Which dump the archive holds, so a leftover from an older run is never
// ingested as the current one.
const TMP_GZ_TAG = `${TMP_GZ}.updated-at`

// Only these are ever requested by the app (site locale is FR or EN).
// Ingesting every language would take the DB from ~240 MB to ~700 MB.
const LANGS = new Set(['en', 'fr'])

const UA = 'Prism/0.3.2 (+https://github.com/Diix46/SpellForge)'
const COLOR_BIT = { W: 1, U: 2, B: 4, R: 8, G: 16 }

// Scryfall hides these from search by default. Mirror that, or our result
// counts silently diverge from everyone's expectations.
const EXTRA_LAYOUTS = new Set(['art_series', 'token', 'double_faced_token', 'emblem', 'scheme', 'planar', 'vanguard'])
const EXTRA_SET_TYPES = new Set(['memorabilia', 'token', 'minigame'])

const force = process.argv.includes('--force')

// Bump whenever the schema changes. A database built by an older script is
// rebuilt even when the Scryfall dump has not moved: the app would otherwise
// query columns that do not exist yet.
const SCHEMA_VERSION = '2'
const log = (...a) => console.log(...a)
const mb = n => `${(n / 1048576).toFixed(1)} MB`

// ─── helpers ───────────────────────────────────────────────────────────────

/** Accent-insensitive, case-insensitive key used for exact + prefix matching. */
function fold(s) {
  // \p{M} = every Unicode combining mark, which is exactly what NFD splits
  // accents into. Safer than spelling out the combining-mark code point range,
  // which lint flags as obscure.
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

/**
 * Rules text without its reminder text — the parenthesised explanations.
 * Scryfall's `oracle:` search ignores them; our index must too.
 */
function stripReminder(text) {
  return text ? text.replace(/\([^)]*\)/g, '') : null
}

// Produced mana can be colourless, which a colour never is: one extra bit.
const MANA_BIT = { ...COLOR_BIT, C: 32 }

function manaMask(symbols) {
  let m = 0
  for (const s of symbols || []) m |= MANA_BIT[s] || 0
  return m
}

/**
 * Rules text of every face. Multi-faced cards have no top-level oracle_text,
 * so reading only the first face left back faces unsearchable: Delver of
 * Secrets could not be found by its flying side.
 */
function oracleAll(card) {
  const texts = (card.card_faces || []).map(f => f.oracle_text).filter(Boolean)
  return texts.length ? texts.join('\n//\n') : (card.oracle_text || null)
}

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Oracle text now says "this creature" where it used to repeat the card's name
 * (the 2025 self-reference update), and Scryfall's `~` matches both forms.
 */
const SELF_REFERENCE = /\bthis (?:artifact|attraction|aura|background|battle|card|case|class|contraption|creature|enchantment|equipment|land|permanent|planeswalker|room|saga|siege|spell|token|vehicle)\b/gi

/**
 * The text `o:"~ …"` searches: the card's own name and its self-references
 * written `~`. Whole words only — "Fire" from Fire // Ice must not turn
 * "Firebreathing" into "~breathing".
 */
function selfText(card, text) {
  if (!text)
    return null
  let out = text.replace(SELF_REFERENCE, '~')
  const full = [card.name, ...(card.card_faces || []).map(f => f.name)].filter(Boolean)
  // Legends call themselves by their short name: "Chandra deals 2 damage".
  const short = full.filter(n => n.includes(', ')).map(n => n.split(', ')[0])
  const names = new Set([...full, ...short])
  for (const n of [...names].sort((a, b) => b.length - a.length))
    out = out.replace(new RegExp(`(?<!\\p{L})${escapeRegExp(n)}(?!\\p{L})`, 'gu'), '~')
  return out
}

/**
 * Generic mana in a cost, wherever it is written: {X}{2}{U} holds 2. Null when
 * the cost has none, so `m:1` does not match {G}.
 */
function genericMana(cost) {
  const numbers = [...(cost || '').matchAll(/\{(\d+)\}/g)].map(m => Number(m[1]))
  return numbers.length ? numbers.reduce((a, b) => a + b, 0) : null
}

/**
 * One row per face: Scryfall checks costs, types and stats face by face, so
 * `pow>=3` finds Delver of Secrets by its 3/2 back, and `m:{G}{G}` does not
 * add up the two halves of "{1}{G} // {G}". A card without faces is its own.
 */
function faceRows(card) {
  const sources = card.card_faces?.length ? card.card_faces : [card]
  const rows = sources.map(f => [
    f.mana_cost || null,
    genericMana(f.mana_cost),
    f.type_line ?? null,
    f.oracle_text ? 1 : 0,
    f.power ?? null,
    f.toughness ?? null,
    f.loyalty ?? null,
  ])
  return [...new Map(rows.map(r => [r.join('|'), r])).values()]
}

/** Formats where the card is legal, restricted or banned; "not_legal" is implied. */
function legalityJson(card) {
  const kept = Object.entries(card.legalities || {}).filter(([, v]) => v !== 'not_legal')
  return kept.length ? JSON.stringify(Object.fromEntries(kept)) : null
}

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
     -- Search-only columns for the query syntax (o:, fo:, f:, produces:).
     -- oracle_all joins every face; rules_text drops reminder text, as o:
     -- does; self_text also writes the card's self-references as ~.
     oracle_all      TEXT,
     rules_text      TEXT,
     self_text       TEXT,
     legalities      TEXT,
     produced_mask   INTEGER NOT NULL DEFAULT 0,
     is_reserved     INTEGER NOT NULL DEFAULT 0,
     is_game_changer INTEGER NOT NULL DEFAULT 0,
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
     artist           TEXT,
     -- Printing-level flags for the landing hero, which wants recognisably
     -- Magic cards printed on paper. Universes Beyond has no dedicated field:
     -- it is marked in promo_types, as checked on a Lord of the Rings and a
     -- Marvel printing.
     is_paper         INTEGER NOT NULL DEFAULT 0,
     is_digital       INTEGER NOT NULL DEFAULT 0,
     is_ub            INTEGER NOT NULL DEFAULT 0,
     -- Memorabilia and joke sets hide a printing, not a card: a gold-bordered
     -- reprint must not hide Demonic Tutor. Rolled up in finalize().
     set_type         TEXT
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
  // One row per face, for the query syntax's face-level tests (m:, pow:,
  // is:vanilla…). has_text stands in for the rules text already stored above.
  `CREATE TABLE oracle_faces (
     oracle_id TEXT NOT NULL,
     mana_cost TEXT,
     generic   INTEGER,
     type_line TEXT,
     has_text  INTEGER NOT NULL DEFAULT 0,
     power     TEXT,
     toughness TEXT,
     loyalty   TEXT
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
  // `cmc>pow` probes each card's faces; without this it rescanned all of them
  // for every card and held the server for three minutes.
  `CREATE INDEX idx_faces_oracle   ON oracle_faces(oracle_id)`,
  // `r:mythic` becomes "cards with a mythic printing": a lookup, not a scan.
  `CREATE INDEX idx_print_rarity   ON printings(rarity, oracle_id)`,
  `CREATE INDEX idx_parts_oracle   ON card_parts(oracle_id)`,
]

// ─── step 1 — bulk metadata ────────────────────────────────────────────────

/** The network cause behind undici's bare "fetch failed". */
const causeOf = e => [e.message, e.cause?.code ?? e.cause?.message].filter(Boolean).join(' — ')

/**
 * fetch with three attempts. Connection failures here are transient and were
 * seen twice in a row on a working network, while each attempt costs nothing
 * next to a failed nightly refresh. HTTP errors are not retried.
 */
async function fetchRetry(url, init, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, init)
    }
    catch (e) {
      if (i >= attempts)
        throw new Error(`${url.split('?')[0]} : ${causeOf(e)}`)
      log(`  ! essai ${i}/${attempts} échoué (${causeOf(e)}), nouvel essai dans ${i * 2} s`)
      await new Promise(r => setTimeout(r, i * 2000))
    }
  }
}

async function fetchBulkMeta() {
  const res = await fetchRetry('https://api.scryfall.com/bulk-data/all_cards', {
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
    const r = await db.execute({ sql: `SELECT key, value FROM meta WHERE key IN ('bulk_updated_at', 'schema_version')`, args: [] })
    db.close()
    const meta = Object.fromEntries(r.rows.map(row => [row.key, row.value]))
    return meta.bulk_updated_at === updatedAt && meta.schema_version === SCHEMA_VERSION
  }
  catch { return false }
}

// ─── step 2 — download ─────────────────────────────────────────────────────

/**
 * Downloads to a `.part` file and renames it once complete, so an interrupted
 * transfer never leaves an archive that looks usable: the next attempt would
 * reuse it and fail on the truncated gzip every time.
 */
async function download(uri, expected, updatedAt) {
  log(`  ↓ ${uri.split('/').pop()}  (${mb(expected)})`)
  const t0 = Date.now()
  const res = await fetchRetry(uri, { headers: { 'User-Agent': UA } })
  if (!res.ok)
    throw new Error(`download: HTTP ${res.status}`)
  // Bytes on disk match Content-Length unless the transfer itself was encoded.
  const announced = res.headers.get('content-encoding') ? null : Number(res.headers.get('content-length')) || null
  const part = `${TMP_GZ}.part`

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
  await pipeline(src, createWriteStream(part))
  if (announced && got !== announced)
    throw new Error(`download: ${got} octets reçus sur ${announced}`)
  renameSync(part, TMP_GZ)
  writeFileSync(TMP_GZ_TAG, updatedAt)
  process.stdout.write(`\r    100%  en ${((Date.now() - t0) / 1000).toFixed(1)} s\n`)
}

/** Drops the archive and its tag, after a success or a failure alike. */
function dropArchive() {
  for (const f of [TMP_GZ, `${TMP_GZ}.part`, TMP_GZ_TAG]) rmSync(f, { force: true })
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
    'oracle_all',
    'rules_text',
    'self_text',
    'legalities',
    'produced_mask',
    'is_reserved',
    'is_game_changer',
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
    'is_paper',
    'is_digital',
    'is_ub',
    'set_type',
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
  const faceStats = new Batch(db, 'oracle_faces', ['oracle_id', 'mana_cost', 'generic', 'type_line', 'has_text', 'power', 'toughness', 'loyalty'])

  const seenOracle = new Set()
  const pendingOracle = new Map()

  async function pushOracle(c, oracleId) {
    const face0 = c.card_faces?.[0]
    // Oracle-level fields are language-invariant in Scryfall (the localized
    // text lives in printed_*), so any canonical row is authoritative.
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
    const rules = stripReminder(oracleAll(c))

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
      oracleAll(c),
      rules,
      selfText(c, rules),
      legalityJson(c),
      manaMask(c.produced_mana),
      c.reserved ? 1 : 0,
      c.game_changer ? 1 : 0,
      mask(c.colors ?? face0?.colors),
      mask(c.color_identity),
      legal,
      isCmd,
      // Joke and memorabilia sets are rolled up from every printing in
      // finalize(); only the layout decides here.
      0,
      EXTRA_LAYOUTS.has(c.layout) ? 1 : 0,
      c.edhrec_rank ?? null,
    ])

    for (const row of faceRows(c))
      await faceStats.push([oracleId, ...row])

    for (const p of c.all_parts || []) {
      if (p.component === 'token' && p.name)
        await parts.push([oracleId, p.name])
    }
  }
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
      // A reversible printing has no top-level card data and a doubled name
      // ("Magmatic Hellkite // Magmatic Hellkite"). When one came first in the
      // file it defined the card, renaming 11 of them; it is now a last resort.
      if (c.layout === 'reversible_card' || !c.oracle_id) {
        if (!pendingOracle.has(oracleId))
          pendingOracle.set(oracleId, c)
      }
      else {
        seenOracle.add(oracleId)
        await pushOracle(c, oracleId)
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
      c.games?.includes('paper') ? 1 : 0,
      c.digital ? 1 : 0,
      // Universes Beyond is a printing property, flagged in promo_types — a
      // Marvel reprint of Lightning Bolt is UB even though the card is not.
      c.promo_types?.includes('universesbeyond') ? 1 : 0,
      c.set_type || null,
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

  // Cards known only through reversible printings still need a row.
  for (const [oracleId, c] of pendingOracle) {
    if (!seenOracle.has(oracleId)) {
      seenOracle.add(oracleId)
      await pushOracle(c, oracleId)
    }
  }

  await oracles.flush()
  await prints.flush()
  await faces.flush()
  await parts.flush()
  await faceStats.flush()
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

  // Scryfall hides a card as an extra only when it has no regular printing,
  // and calls it funny only when it is printed in joke sets alone AND is
  // playable nowhere — half of Unfinity is legal and must stay searchable.
  log('  · cartes à part (collection, blagues)')
  await db.execute(`UPDATE oracle_cards SET is_extra = 1
                     WHERE is_extra = 0
                       AND NOT EXISTS (SELECT 1 FROM printings p
                                        WHERE p.oracle_id = oracle_cards.oracle_id
                                          AND COALESCE(p.set_type, '') NOT IN (${[...EXTRA_SET_TYPES].map(t => `'${t}'`).join(', ')}))`)
  await db.execute(`UPDATE oracle_cards SET is_funny = 1
                     WHERE NOT EXISTS (SELECT 1 FROM printings p
                                        WHERE p.oracle_id = oracle_cards.oracle_id
                                          AND COALESCE(p.set_type, '') != 'funny')
                       AND NOT EXISTS (SELECT 1 FROM json_each(oracle_cards.legalities)
                                        WHERE value IN ('legal', 'restricted'))`)

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
  //
  // Rules text is indexed WITHOUT its reminder text, matching Scryfall's
  // `oracle:` search. Bulk oracle_text keeps the parenthesised explanations, and
  // indexing them made the "draw" theme match every cycling card ("Discard this
  // card: Draw a card.") — 582 false hits, +22 % against Scryfall. The text
  // shown to players is untouched; only the search column is stripped.
  const { rows: sources } = await db.execute(`
    SELECT o.oracle_id, o.name_folded, o.oracle_all, o.type_line,
           (SELECT p.printed_name FROM printings p
             WHERE p.oracle_id = o.oracle_id AND p.lang = 'fr' AND p.printed_name IS NOT NULL LIMIT 1) AS printed_name,
           (SELECT p.printed_text FROM printings p
             WHERE p.oracle_id = o.oracle_id AND p.lang = 'fr' AND p.printed_text IS NOT NULL LIMIT 1) AS printed_text
      FROM oracle_cards o`)
  const search = new Batch(db, 'card_search', ['oracle_id', 'name_folded', 'printed_name', 'oracle_text', 'printed_text', 'type_line'])
  await db.execute('BEGIN')
  for (const r of sources) {
    await search.push([
      r.oracle_id,
      r.name_folded,
      r.printed_name,
      stripReminder(r.oracle_all),
      stripReminder(r.printed_text),
      r.type_line,
    ])
  }
  await search.flush()
  await db.execute('COMMIT')

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
                       ORDER BY (p.lang = ?) DESC,
                                COALESCE(p.set_type, '') IN (${[...EXTRA_SET_TYPES].map(t => `'${t}'`).join(', ')}) ASC,
                                p.is_highres DESC, p.released_at DESC
                     ) AS rn
                FROM printings p
               WHERE p.lang IN (?, 'en') AND p.is_real_image = 1
            ) WHERE rn = 1`,
      args: [lang, lang, lang],
    })
  }

  await db.execute({ sql: `INSERT OR REPLACE INTO meta (key,value) VALUES ('bulk_updated_at',?)`, args: [meta.updatedAt] })
  await db.execute({ sql: `INSERT OR REPLACE INTO meta (key,value) VALUES ('ingested_at',?)`, args: [new Date().toISOString()] })
  await db.execute({ sql: `INSERT OR REPLACE INTO meta (key,value) VALUES ('schema_version',?)`, args: [SCHEMA_VERSION] })

  // Without statistics the planner assumes every index is equally selective and
  // picks the three default-filter columns, which match 82 % of cards: an exact
  // name lookup walked 31 000 rows (32 ms) instead of one index probe (0.05 ms).
  log('  · statistiques du planificateur')
  await db.execute('ANALYZE')

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

  const reusable = !force && existsSync(TMP_GZ) && existsSync(TMP_GZ_TAG)
    && readFileSync(TMP_GZ_TAG, 'utf8') === meta.updatedAt
  if (reusable) {
    log(`  ↓ archive déjà présente (${mb(meta.size)}), réutilisée`)
  }
  else {
    dropArchive()
    await download(meta.uri, meta.size, meta.updatedAt)
  }

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
  dropArchive()

  log(`\n  ✔ ${FINAL_DB.replace(`${ROOT}/`, '')} — ${mb(statSync(FINAL_DB).size)}`)
  log(`    ${stats.oracles.toLocaleString('fr-FR')} cartes · ${stats.kept.toLocaleString('fr-FR')} impressions · ${((Date.now() - t0) / 1000).toFixed(1)} s au total\n`)
}

main().catch((e) => {
  console.error('\n✖ ingestion échouée :', causeOf(e))
  // The next attempt starts clean: a corrupt archive would fail it the same way.
  dropArchive()
  for (const ext of ['', '-wal', '-shm']) rmSync(`${TMP_DB}${ext}`, { force: true })
  process.exitCode = 1
})
