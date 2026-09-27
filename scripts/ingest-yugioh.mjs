#!/usr/bin/env node
/**
 * Yu-Gi-Oh! ingestion — YGOPRODeck → local SQLite (scripts/tcg/schema.mjs).
 *
 * Source: https://db.ygoprodeck.com/api/v7 — the whole card list in one
 * request (English, then French names and texts by the same ids), the sets,
 * the TCG banlist. A printing is a card in a set (its set code, "LOB-EN005",
 * and rarity); cards never printed for the TCG are left out. The rules count
 * copies by name. Prices: YGOPRODeck gives one Cardmarket price per card, its
 * cheapest printing, stored on every printing (a floor, not a quote).
 *
 * Images are not hotlinked (YGOPRODeck asks not to): the app's image route
 * fetches each one once and keeps it (server/api/images/tcg).
 *
 * The API's version number is the signature: an unchanged database is left
 * as is. Usage: node scripts/ingest-yugioh.mjs [--force]
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { fold, getJson, rebuildSearch, SCHEMA, SCHEMA_VERSION, workingCopy } from './tcg/schema.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = process.env.YUGIOH_CARDS_DB ? resolve(process.env.YUGIOH_CARDS_DB) : resolve(ROOT, '.data/cards-yugioh.db')
const API = 'https://db.ygoprodeck.com/api/v7'
const force = process.argv.includes('--force')
const log = (...a) => console.log(...a)

// Monsters that live in the Extra Deck, by frame.
const EXTRA_FRAMES = new Set(['fusion', 'synchro', 'xyz', 'link', 'fusion_pendulum', 'synchro_pendulum', 'xyz_pendulum'])
const LIMIT = { 'Forbidden': 0, 'Limited': 1, 'Semi-Limited': 2 }

function categoryOf(c) {
  if (c.type.includes('Spell'))
    return 'Spell'
  if (c.type.includes('Trap'))
    return 'Trap'
  if (c.type === 'Skill Card' || c.type === 'Token')
    return null
  return 'Monster'
}

/** Monsters: their frame (Effect, Fusion, Xyz…); Spells and Traps: their kind (Quick-Play, Counter…). */
function subtypeOf(c, category) {
  if (category !== 'Monster')
    return c.race ?? null
  const frame = String(c.frameType ?? '').split('_')[0]
  return { normal: 'Normal', effect: 'Effect', ritual: 'Ritual', fusion: 'Fusion', synchro: 'Synchro', xyz: 'Xyz', link: 'Link' }[frame] ?? 'Effect'
}

function statsOf(c) {
  const s = {}
  for (const k of ['atk', 'def', 'level', 'scale', 'linkval']) {
    if (c[k] != null)
      s[k === 'linkval' ? 'link' : k] = Number(c[k])
  }
  // An Xyz monster's stars are a Rank.
  if (String(c.frameType).startsWith('xyz') && s.level != null) {
    s.rank = s.level
    delete s.level
  }
  return s
}

/** Set code → a printing id: "LOB-EN005"; the same code in two rarities gets the rarity too. */
function printingIds(sets) {
  const seen = new Map()
  return sets.map((s) => {
    const base = String(s.set_code).trim()
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    const rarity = String(s.set_rarity_code ?? s.set_rarity ?? '').replace(/\W/g, '')
    return n === 0 ? base : `${base}-${rarity || n}`
  })
}

async function main() {
  const t0 = Date.now()
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const version = (await getJson(`${API}/checkDBVer.php`))?.[0]?.database_version ?? null
  const work = workingCopy(DB_PATH)
  const db = work.db
  const meta = async key => (await db.execute({ sql: 'SELECT value FROM meta WHERE key = ?', args: [key] }).catch(() => ({ rows: [] }))).rows[0]?.value
  const schema = await meta('schema_version')
  if (!force && schema === SCHEMA_VERSION && version && await meta('source_version') === version) {
    work.abort()
    log(`Yu-Gi-Oh — déjà à jour (base YGOPRODeck ${version})`)
    return
  }
  if (schema && schema !== SCHEMA_VERSION)
    await db.batch(['DROP TABLE IF EXISTS cards', 'DROP TABLE IF EXISTS sets', 'DROP TABLE IF EXISTS card_search'], 'write')
  await db.batch(SCHEMA, 'write')

  log(`Yu-Gi-Oh — YGOPRODeck ${version ?? '?'}`)
  const [en, fr, sets, banlist] = await Promise.all([
    getJson(`${API}/cardinfo.php?misc=yes`),
    getJson(`${API}/cardinfo.php?language=fr`).catch(() => ({ data: [] })),
    getJson(`${API}/cardsets.php`),
    getJson(`${API}/cardinfo.php?banlist=tcg`).catch(() => ({ data: [] })),
  ])
  // The French list names a card by another of its artworks' passcodes than
  // the English one does: matched on any of them.
  const french = new Map()
  for (const c of fr?.data ?? []) {
    for (const img of c.card_images ?? [{ id: c.id }])
      french.set(img.id, c)
  }
  const limits = new Map((banlist?.data ?? []).map(c => [c.id, LIMIT[c.banlist_info?.ban_tcg] ?? null]))
  log(`  ${en.data.length} cartes, ${french.size} en français, ${sets.length} extensions`)

  const setRows = new Map()
  for (const s of sets) {
    if (!s.set_code || setRows.has(s.set_code))
      continue
    setRows.set(s.set_code, s)
  }
  const usedSets = new Set()
  const rows = []
  const aliases = []
  for (const c of en.data) {
    const category = categoryOf(c)
    if (!category || !c.card_sets?.length)
      continue
    const f = french.get(c.id) ?? (c.card_images ?? []).map(i => french.get(i.id)).find(Boolean)
    for (const img of c.card_images ?? []) {
      if (img.id !== c.id)
        aliases.push({ sql: 'INSERT OR IGNORE INTO aliases (alias, code) VALUES (?, ?)', args: [String(img.id), String(c.id)] })
    }
    const img = c.card_images?.[0]
    const limit = limits.get(c.id) ?? null
    const tcg = !!c.misc_info?.[0]?.tcg_date || !!c.card_sets?.length
    const types = category === 'Monster' && c.attribute ? [c.attribute] : []
    const extra = JSON.stringify({
      race: c.race ?? null,
      archetype: c.archetype ?? null,
      typeline: c.typeline ?? null,
      linkmarkers: c.linkmarkers ?? null,
      extraDeck: EXTRA_FRAMES.has(c.frameType),
      limit,
    })
    const ids = printingIds(c.card_sets)
    c.card_sets.forEach((s, i) => {
      const [setCode, number = s.set_code] = String(s.set_code).split(/-(.*)/s)
      usedSets.add(setCode)
      const price = c.card_prices?.[0]?.cardmarket_price
      for (const [lang, name, text] of [['en', c.name, c.desc], ...(f ? [['fr', f.name, f.desc]] : [])]) {
        rows.push({
          sql: `INSERT OR REPLACE INTO cards (id, lang, card_key, code, name, name_en, name_folded, number, set_code, rarity, category, subtype, types, stats, text, image, thumb, finishes, price_eur, price_eur_foil, cardmarket_id, regulation, legal, banned, extra)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, NULL, NULL, ?, ?, ?)`,
          args: [
            ids[i],
            lang,
            fold(c.name),
            String(c.id),
            name,
            c.name,
            fold(name),
            number,
            setCode,
            s.set_rarity ?? null,
            category,
            subtypeOf(c, category),
            JSON.stringify(types),
            JSON.stringify(statsOf(c)),
            text ?? null,
            img?.image_url ?? null,
            img?.image_url_small ?? null,
            price != null && Number(price) > 0 ? Number(price) : null,
            JSON.stringify(tcg && limit !== 0 ? ['tcg'] : []),
            limit === 0 ? 1 : 0,
            extra,
          ],
        })
      }
    })
  }
  await db.execute('DELETE FROM cards')
  await db.execute('DELETE FROM sets')
  await db.execute('DELETE FROM aliases')
  for (const list of [rows, aliases]) {
    for (let i = 0; i < list.length; i += 2000)
      await db.batch(list.slice(i, i + 2000), 'write')
  }
  const setInserts = []
  for (const code of usedSets) {
    const s = setRows.get(code)
    for (const lang of ['en', 'fr']) {
      setInserts.push({
        sql: 'INSERT OR REPLACE INTO sets (code, lang, name, abbr, series, released, total, symbol, logo, signature) VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, ?, NULL)',
        args: [code, lang, s?.set_name ?? code, code, s?.tcg_date ?? null, Number(s?.num_of_cards ?? 0), s?.set_image ?? null],
      })
    }
  }
  await db.batch(setInserts, 'write')
  await rebuildSearch(db)
  await db.batch([
    { sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (\'schema_version\', ?)', args: [SCHEMA_VERSION] },
    { sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (\'source_version\', ?)', args: [version] },
    { sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (\'ingested_at\', ?)', args: [new Date().toISOString()] },
  ], 'write')
  work.commit()
  log(`✔ ${DB_PATH} — ${rows.length} impressions · ${usedSets.size} extensions · ${Math.round((Date.now() - t0) / 1000)} s`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
