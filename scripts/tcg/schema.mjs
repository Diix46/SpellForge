/**
 * The card database shared by the games built on the generic engine
 * (Pokémon, Yu-Gi-Oh, Riftbound): one SQLite file per game,
 * `.data/cards-<game>.db`, the same tables in each. An ingest script fills
 * it; server/utils/tcg reads it. Magic and One Piece keep their own.
 *
 * A **printing** is one card in one set in one language (`id` + `lang`);
 * its `card_key` groups the printings of one card (what deck rules count).
 */
import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs'
import { createClient } from '@libsql/client'

export const SCHEMA_VERSION = '2'

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sets (
     code       TEXT NOT NULL,
     lang       TEXT NOT NULL,
     name       TEXT NOT NULL,
     -- The code players write in their lists (Pokémon TCG Live: "OBF").
     abbr       TEXT,
     series     TEXT,
     released   TEXT,
     total      INTEGER NOT NULL DEFAULT 0,
     symbol     TEXT,
     logo       TEXT,
     -- What the source says of it, to fetch it again only when it moved.
     signature  TEXT,
     PRIMARY KEY (code, lang)
   )`,
  `CREATE TABLE IF NOT EXISTS cards (
     id          TEXT NOT NULL,
     lang        TEXT NOT NULL,
     card_key    TEXT NOT NULL,
     name        TEXT NOT NULL,
     name_en     TEXT,
     name_folded TEXT NOT NULL,
     number      TEXT NOT NULL,
     set_code    TEXT NOT NULL,
     rarity      TEXT,
     category    TEXT NOT NULL,
     subtype     TEXT,
     -- Colours / types / attributes, JSON array.
     types       TEXT,
     -- Numbers a game shows (hp, atk, def, level, might…), JSON object.
     stats       TEXT,
     -- Rules text, lines separated by \\n.
     text        TEXT,
     image       TEXT,
     thumb       TEXT,
     -- Finishes it exists in: bit 1 normal, 2 foil/holo, 4 reverse, 8 first edition.
     finishes    INTEGER NOT NULL DEFAULT 1,
     price_eur      REAL,
     price_eur_foil REAL,
     cardmarket_id  INTEGER,
     regulation  TEXT,
     -- Formats it is legal in, JSON array; banned (0/1).
     legal       TEXT,
     banned      INTEGER NOT NULL DEFAULT 0,
     extra       TEXT,
     PRIMARY KEY (id, lang)
   )`,
  'CREATE INDEX IF NOT EXISTS idx_cards_key ON cards(card_key)',
  'CREATE INDEX IF NOT EXISTS idx_cards_set ON cards(set_code, lang)',
  'CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name_folded)',
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
]

/** Accents off, lower case: what the search compares. */
export const fold = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/** The full-text index, rebuilt after each ingest (small: a second). */
export async function rebuildSearch(db) {
  await db.batch([
    'DROP TABLE IF EXISTS card_search',
    `CREATE VIRTUAL TABLE card_search USING fts5(id UNINDEXED, lang UNINDEXED, name, name_en, text, tokenize="unicode61 remove_diacritics 2")`,
    `INSERT INTO card_search (id, lang, name, name_en, text) SELECT id, lang, name, name_en, text FROM cards`,
  ], 'write')
}

/** Bounded concurrency. */
export async function mapPool(items, limit, fn) {
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

/** A JSON fetch with retries on connection failures (not on HTTP errors). */
export async function getJson(url, { headers = {}, attempts = 4 } = {}) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Prism/0.3.2 (+https://github.com/Diix46/SpellForge)', 'Accept': 'application/json', ...headers } })
      if (res.status === 404)
        return null
      if (!res.ok)
        throw new Error(`HTTP ${res.status}`)
      return await res.json()
    }
    catch (e) {
      if (i >= attempts || e.message.startsWith('HTTP'))
        throw new Error(`${url} : ${[e.message, e.cause?.code].filter(Boolean).join(' — ')}`)
      await new Promise(r => setTimeout(r, i * 1500))
    }
  }
}

/**
 * The database to update, as a working copy beside it: the server keeps
 * reading the current file (a write in place would lock it out mid-ingest),
 * `commit` swaps the copy in with an atomic rename, the refresh task then
 * reopens it (server/utils/cards/db.ts reopenCardDbs).
 */
export function workingCopy(path) {
  const tmp = `${path}.tmp`
  rmSync(tmp, { force: true })
  if (existsSync(path))
    copyFileSync(path, tmp)
  const db = createClient({ url: `file:${tmp}` })
  return {
    db,
    commit() {
      db.close()
      renameSync(tmp, path)
    },
    abort() {
      db.close()
      rmSync(tmp, { force: true })
    },
  }
}
