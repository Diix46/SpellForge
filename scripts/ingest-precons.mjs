#!/usr/bin/env node
/**
 * Preconstructed decks — MTGJSON (Magic) and Limitless TCG (One Piece
 * starter decks) → local SQLite.
 *
 * Source: https://mtgjson.com — DeckList.json names every product deck
 * (Commander decks, Secret Lair drops, Jumpstart, theme and starter decks…),
 * and one file per deck lists its cards with their exact printing (set,
 * collector number, Scryfall id) and foiling. EDHREC only knows commanders,
 * not what came in the box.
 *
 * Incremental: a deck, once released, does not change, so only the decks not
 * yet on disk are downloaded (the first run fetches them all, a few hundred
 * megabytes; a night after a release, a handful). Digital-only products
 * (MTGO, Arena, Shandalar…) are left out: nobody holds them in a binder.
 *
 * One Piece: Bandai's pages list a starter deck's cards but not how many of
 * each; Limitless TCG's card pages carry the recipe, in the link to their
 * deck image (`imggen?c=…`, a count before each card id). The starters come
 * from our own One Piece database (its `ST-` sets), their names in French and
 * English from Bandai's pack titles. A starter with no recipe there (the
 * Ultra decks, made of reprints) is tried again the next night.
 *
 * Output: `.data/precons.db` (PRECONS_DB moves it), updated in place.
 *
 * Usage:  node scripts/ingest-precons.mjs [--limit N]
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = process.env.PRECONS_DB ? resolve(process.env.PRECONS_DB) : resolve(ROOT, '.data/precons.db')
const OPTCG_DB = process.env.OPTCG_CARDS_DB ? resolve(process.env.OPTCG_CARDS_DB) : resolve(ROOT, '.data/cards-optcg.db')
const LIMITLESS = 'https://onepiece.limitlesstcg.com'
const BASE = 'https://mtgjson.com/api/v5'
const UA = 'Prism/0.3.2 (+https://github.com/Diix46/SpellForge)'
const CONCURRENCY = 6

// Products only ever sold on a screen.
const DIGITAL = new Set([
  'MTGO Redemption',
  'MTGO Theme Deck',
  'Arena Starter Deck',
  'Arena Starter Kit',
  'Arena Promotional Deck',
  'Historic Brawl Precon Deck',
  'Shandalar Enemy Deck',
  'Duel Of The Planeswalkers Deck',
  'Sample Deck',
])
// The sections that hold cards a player keeps (not tokens, planes, schemes).
const SECTIONS = ['commander', 'mainBoard', 'sideBoard']

const log = (...a) => console.log(...a)
const limitArg = process.argv.indexOf('--limit')
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity

const causeOf = e => [e.message, e.cause?.code ?? e.cause?.message].filter(Boolean).join(' — ')

async function getJson(path, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(`${BASE}/${path}`, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
      if (!res.ok)
        throw new Error(`${path}: HTTP ${res.status}`)
      return (await res.json()).data
    }
    catch (e) {
      if (i >= attempts)
        throw new Error(causeOf(e))
      await new Promise(r => setTimeout(r, 2000 * i))
    }
  }
}

mkdirSync(dirname(DB_PATH), { recursive: true })
const db = createClient({ url: `file:${DB_PATH}` })
await db.batch([
  `CREATE TABLE IF NOT EXISTS precons (
     file      TEXT PRIMARY KEY,
     code      TEXT NOT NULL,
     name      TEXT NOT NULL,
     type      TEXT NOT NULL,
     released  TEXT,
     cards     INTEGER NOT NULL,
     commander TEXT,
     -- Scryfall id of the commander (or first card): the deck's face.
     face_id   TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS precon_cards (
     file        TEXT NOT NULL,
     section     TEXT NOT NULL,
     count       INTEGER NOT NULL,
     name        TEXT NOT NULL,
     set_code    TEXT NOT NULL,
     number      TEXT NOT NULL,
     scryfall_id TEXT,
     foil        INTEGER NOT NULL DEFAULT 0
   )`,
  'CREATE INDEX IF NOT EXISTS idx_precon_cards_file ON precon_cards(file)',
  'CREATE INDEX IF NOT EXISTS idx_precons_released ON precons(released)',
], 'write')
// Columns added with One Piece: a base built before gets them.
const columns = new Set((await db.execute('SELECT name FROM pragma_table_info(\'precons\')')).rows.map(r => String(r.name)))
if (!columns.has('game'))
  await db.execute('ALTER TABLE precons ADD COLUMN game TEXT NOT NULL DEFAULT \'mtg\'')
if (!columns.has('name_fr'))
  await db.execute('ALTER TABLE precons ADD COLUMN name_fr TEXT')

const t0 = Date.now()
log('Decks préconstruits Magic — MTGJSON')
const list = (await getJson('DeckList.json')).filter(d => !DIGITAL.has(d.type))
const known = new Set((await db.execute('SELECT file FROM precons')).rows.map(r => String(r.file)))
const todo = list.filter(d => !known.has(d.fileName)).slice(0, limit)
log(`${list.length} decks physiques, ${known.size} déjà en base, ${todo.length} à récupérer`)

let done = 0
let failed = 0
async function ingest(d) {
  const deck = await getJson(`decks/${encodeURIComponent(d.fileName)}.json`)
  const rows = []
  for (const section of SECTIONS) {
    for (const c of deck[section] ?? []) {
      rows.push({
        sql: 'INSERT INTO precon_cards (file, section, count, name, set_code, number, scryfall_id, foil) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [d.fileName, section, c.count ?? 1, c.name, String(c.setCode ?? '').toLowerCase(), String(c.number ?? ''), c.identifiers?.scryfallId ?? null, c.isFoil ? 1 : 0],
      })
    }
  }
  if (!rows.length)
    return
  const face = deck.commander?.[0] ?? deck.displayCommander?.[0] ?? deck.mainBoard?.[0]
  const cards = SECTIONS.reduce((n, s) => n + (deck[s] ?? []).reduce((m, c) => m + (c.count ?? 1), 0), 0)
  await db.batch([
    { sql: 'DELETE FROM precon_cards WHERE file = ?', args: [d.fileName] },
    ...rows,
    {
      sql: 'INSERT OR REPLACE INTO precons (file, game, code, name, type, released, cards, commander, face_id) VALUES (?, \'mtg\', ?, ?, ?, ?, ?, ?, ?)',
      args: [d.fileName, String(d.code).toLowerCase(), d.name, d.type, d.releaseDate ?? null, cards, deck.commander?.[0]?.name ?? null, face?.identifiers?.scryfallId ?? null],
    },
  ], 'write')
}

// A few at a time: polite to MTGJSON, quick enough for a first full run.
const queue = [...todo]
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  for (let d = queue.shift(); d; d = queue.shift()) {
    try {
      await ingest(d)
    }
    catch (e) {
      failed++
      console.error(`  ✗ ${d.fileName} : ${e.message}`)
    }
    if (++done % 100 === 0)
      log(`  ${done} / ${todo.length}`)
  }
}))

// ---- One Piece starter decks ------------------------------------------------

/** "ST21001" → "ST21-001", "P001" → "P-001". */
const cardId = raw => (raw.startsWith('P') && raw.length === 4 ? `P-${raw.slice(1)}` : `${raw.slice(0, -3)}-${raw.slice(-3)}`)

/**
 * A Limitless deck image link's recipe: a version digit, then for each card
 * its count (one digit), "43" and its id ("ST21001") — "13" and "P029" for a
 * promo —, then an art variant digit: the art is left to the import, which
 * takes the usual one.
 * [] when the page has none.
 */
function recipe(html) {
  const code = /imggen\?c=(\d[0-9A-Z]+)/.exec(html)?.[1]
  if (!code)
    return []
  const out = []
  for (const m of code.slice(1).matchAll(/(\d)(?:43([A-Z]{2}\d{5})|13(P\d{3}))\d/g))
    out.push({ count: Number(m[1]), id: cardId(m[2] ?? m[3]) })
  return out
}

/** "STARTER DECK -Straw Hat Crew- [ST-01]" → "Straw Hat Crew". */
const shortTitle = (title, code) => (typeof title === 'string' ? /-(.+)-\s*\[/.exec(title)?.[1]?.trim() : null) || code

let opDone = 0
try {
  const op = createClient({ url: `file:${OPTCG_DB}` })
  const { rows: starters } = await op.execute(`
    SELECT n.set_code AS code,
           (SELECT title FROM op_packs WHERE label = n.set_code AND lang = 'en') AS en,
           (SELECT title FROM op_packs WHERE label = n.set_code AND lang = 'fr') AS fr
      FROM op_numbers n WHERE n.set_code LIKE 'ST-%' GROUP BY n.set_code ORDER BY n.set_code`)
  const leaders = new Set((await op.execute('SELECT card_number FROM op_numbers WHERE category = \'Leader\'')).rows.map(r => String(r.card_number)))
  op.close()
  const opKnown = new Set((await db.execute('SELECT file FROM precons WHERE game = \'optcg\'')).rows.map(r => String(r.file)))
  const opTodo = starters.filter(s => !opKnown.has(String(s.code)))
  log(`One Piece : ${starters.length} decks de démarrage, ${opTodo.length} à récupérer (Limitless TCG)`)
  for (const s of opTodo) {
    const code = String(s.code)
    try {
      const res = await fetch(`${LIMITLESS}/cards/${code.replace('-', '').toLowerCase()}`, { headers: { 'User-Agent': UA } })
      const cards = res.ok ? recipe(await res.text()) : []
      if (!cards.length) {
        log(`  · ${code} : pas de recette publiée`)
        continue
      }
      const leader = cards.find(c => leaders.has(c.id)) ?? cards[0]
      await db.batch([
        { sql: 'DELETE FROM precon_cards WHERE file = ?', args: [code] },
        ...cards.map(c => ({
          sql: 'INSERT INTO precon_cards (file, section, count, name, set_code, number, scryfall_id, foil) VALUES (?, ?, ?, ?, ?, ?, NULL, 0)',
          args: [code, c === leader ? 'commander' : 'mainBoard', c.count, c.id, code, c.id],
        })),
        {
          sql: 'INSERT OR REPLACE INTO precons (file, game, code, name, name_fr, type, released, cards, commander, face_id) VALUES (?, \'optcg\', ?, ?, ?, \'Starter Deck\', NULL, ?, ?, ?)',
          args: [code, code.toLowerCase(), shortTitle(s.en, code), s.fr ? shortTitle(s.fr, code) : null, cards.reduce((n, c) => n + c.count, 0), leader.id, leader.id],
        },
      ], 'write')
      opDone++
    }
    catch (e) {
      console.error(`  ✗ ${code} : ${causeOf(e)}`)
    }
    // Polite to Limitless.
    await new Promise(r => setTimeout(r, 400))
  }
}
catch (e) {
  // No One Piece base yet: its refresh step runs first, next night then.
  console.error(`One Piece ignoré : ${causeOf(e)}`)
}

const total = Number((await db.execute('SELECT COUNT(*) AS n FROM precons')).rows[0].n)
db.close()
log(`✔ ${DB_PATH} — ${total} decks · ${done - failed} Magic et ${opDone} One Piece ajoutés${failed ? ` · ${failed} en échec` : ''} · ${Math.round((Date.now() - t0) / 1000)} s`)
// Some decks failing (a file missing upstream) is not a failed refresh: they
// are tried again the next night. Nothing reachable at all is.
process.exit(failed && failed === todo.length ? 1 : 0)
