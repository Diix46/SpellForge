#!/usr/bin/env node
/**
 * Pokémon TCG ingestion — TCGdex → local SQLite (scripts/tcg/schema.mjs).
 *
 * Source: https://api.tcgdex.net/v2/{fr,en} (MIT-licensed card database,
 * github.com/tcgdex/cards-database): French names, texts and scans, English
 * for what French does not have, Cardmarket prices per variant (EUR).
 *
 * Set by set, and only the sets whose content moved since the last run (the
 * set's card counts and release date as its signature): the first run fetches
 * every card (~40 000 requests, about ten minutes), a night after a release, one
 * set. Each card's own page gives its types, stats, attacks, variants and
 * prices; a set's page lists its cards.
 *
 * Usage: node scripts/ingest-pokemon.mjs [--force] [--sets sv03.5,sv04]
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { fold, getJson, mapPool, rebuildSearch, SCHEMA, SCHEMA_VERSION, workingCopy } from './tcg/schema.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = process.env.POKEMON_CARDS_DB ? resolve(process.env.POKEMON_CARDS_DB) : resolve(ROOT, '.data/cards-pokemon.db')
const API = 'https://api.tcgdex.net/v2'
const LANGS = ['fr', 'en']
const CONCURRENCY = 20

const force = process.argv.includes('--force')
const only = (() => {
  const i = process.argv.indexOf('--sets')
  return i > 0 ? new Set(process.argv[i + 1].split(',')) : null
})()
const log = (...a) => console.log(...a)

// TCGdex's variants to our finish bits: normal 1, holo 2, reverse 4, first edition 8.
const FINISH_BIT = { normal: 1, holo: 2, reverse: 4, firstEdition: 8 }
// shared/tcg/games/pokemon.ts reads the same names.
const BASIC_ENERGY = /^(?:basic )?(?:grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy) energy$/

/** A card's rules, one line each: abilities, attacks, trainer/energy effect. */
function textOf(c) {
  const lines = []
  for (const a of c.abilities ?? [])
    lines.push(`[${a.type ?? 'Ability'}] ${a.name} — ${a.effect ?? ''}`.trim())
  for (const a of c.attacks ?? [])
    lines.push(`${a.name}${a.damage ? ` ${a.damage}` : ''}${a.effect ? ` — ${a.effect}` : ''}`.trim())
  if (c.effect)
    lines.push(c.effect)
  return lines.join('\n') || null
}

/** Cardmarket prices (EUR): the normal print, and the shiny one (holo, reverse). */
function pricesOf(c) {
  let normal = null
  let foil = null
  let id = null
  for (const v of c.variants_detailed ?? []) {
    const cm = v.pricing?.cardmarket
    if (!cm)
      continue
    id ??= cm.idProduct ?? null
    const p = cm.trend ?? cm.avg ?? cm.avg30 ?? null
    const pf = cm['trend-holo'] || cm['avg-holo'] || null
    if (String(v.type ?? '').toLowerCase() === 'normal')
      normal ??= p
    else
      foil ??= p
    if (pf)
      foil ??= pf
  }
  // Many cards carry their Cardmarket price on the card, not on a variant.
  const cm = c.pricing?.cardmarket
  if (cm) {
    id ??= cm.idProduct ?? null
    normal ??= cm.trend ?? cm.avg ?? cm.avg30 ?? null
    foil ??= cm['trend-holo'] || cm['avg-holo'] || null
  }
  // A card only printed holo: its price is the holo's.
  return { normal: normal ?? (c.variants?.normal ? null : foil), foil, id }
}

/**
 * Today's prices for every card: a set is re-read only when its contents
 * change, but prices move every day. One English read per card (Cardmarket
 * prices a product, the same in both languages), both rows updated.
 */
async function refreshPrices(db) {
  const t0 = Date.now()
  const { rows } = await db.execute('SELECT DISTINCT id FROM cards')
  let priced = 0
  let failed = 0
  const updates = (await mapPool(rows.map(r => String(r.id)), CONCURRENCY, async (id) => {
    const card = await getJson(`${API}/en/cards/${encodeURIComponent(id)}`).catch(() => null)
    if (!card) {
      failed++
      return null
    }
    const { normal, foil, id: product } = pricesOf(card)
    if (normal != null || foil != null)
      priced++
    return { sql: 'UPDATE cards SET price_eur = ?, price_eur_foil = ?, cardmarket_id = COALESCE(?, cardmarket_id) WHERE id = ?', args: [normal, foil, product, id] }
  })).filter(Boolean)
  for (let i = 0; i < updates.length; i += 500)
    await db.batch(updates.slice(i, i + 500), 'write')
  log(`  prix du jour : ${priced} cartes cotées sur ${rows.length}${failed ? `, ${failed} illisibles` : ''} · ${Math.round((Date.now() - t0) / 1000)} s`)
}

function finishesOf(c) {
  let m = 0
  for (const [k, bit] of Object.entries(FINISH_BIT)) {
    if (c.variants?.[k])
      m |= bit
  }
  return m || 1
}

/**
 * A printing's row. `c` is the card in its own language (name, texts); `en`
 * the same card in English, whose values the rules and filters read —
 * TCGdex translates the category, stage and types too ("Dresseur", "De base").
 */
function row(c, lang, en) {
  const base = en ?? c
  const image = c.image ?? en?.image ?? null
  const { normal, foil, id } = pricesOf(c)
  // Basic Energy is legal in every format, whatever its printing says.
  const legal = BASIC_ENERGY.test(fold(base.name)) && base.category === 'Energy'
    ? ['standard', 'expanded']
    : Object.entries(c.legal ?? {}).filter(([, ok]) => ok).map(([f]) => f)
  const stats = {}
  if (c.hp != null)
    stats.hp = Number(c.hp)
  if (c.retreat != null)
    stats.retreat = Number(c.retreat)
  // Attacks and abilities for the card's sheet: words in the card's
  // language, energy costs and weaknesses in English (the client draws them).
  const attacks = (c.attacks ?? []).map((a, i) => ({
    name: a.name,
    cost: base.attacks?.[i]?.cost ?? a.cost ?? [],
    damage: a.damage ?? null,
    effect: a.effect ?? null,
  }))
  const abilities = (c.abilities ?? []).map(a => ({ name: a.name, type: a.type ?? null, effect: a.effect ?? null }))
  return {
    sql: `INSERT OR REPLACE INTO cards (id, lang, card_key, name, name_en, name_folded, number, set_code, rarity, category, subtype, types, stats, text, image, thumb, finishes, price_eur, price_eur_foil, cardmarket_id, regulation, legal, banned, extra)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    args: [
      c.id,
      lang,
      // Deck rules count copies by name, English: the same in every language.
      fold(base.name),
      c.name,
      en?.name ?? null,
      fold(c.name),
      String(c.localId),
      c.set?.id ?? c.id.split('-')[0],
      base.rarity ?? null,
      base.category ?? 'Pokemon',
      base.stage ?? base.trainerType ?? base.energyType ?? null,
      JSON.stringify(base.types ?? []),
      JSON.stringify(stats),
      textOf(c),
      // A French printing TCGdex has no French scan of yet shows the English one.
      image ? `${image}/high.webp` : null,
      image ? `${image}/low.webp` : null,
      finishesOf(c),
      normal,
      foil,
      id,
      c.regulationMark ?? null,
      JSON.stringify(legal),
      JSON.stringify({
        illustrator: c.illustrator ?? null,
        suffix: base.suffix ?? null,
        evolveFrom: c.evolveFrom ?? null,
        dexId: c.dexId ?? null,
        attacks,
        abilities,
        weaknesses: base.weaknesses ?? null,
        resistances: base.resistances ?? null,
      }),
    ],
  }
}

/**
 * TCGdex names a scan for a card before it exists: the newest sets' special
 * cards point to an image that answers 404. Checked on every run for the
 * sets of the last months (a scan may come later), dropped where missing so
 * the library shows these cards last, not as blank tiles on top.
 */
async function dropMissingScans(db) {
  const { rows } = await db.execute(`SELECT c.id, c.lang, c.thumb FROM cards c JOIN sets s ON s.code = c.set_code AND s.lang = c.lang
                                      WHERE c.thumb IS NOT NULL AND s.released >= date('now', '-240 days')`)
  const missing = (await mapPool(rows, CONCURRENCY, async (r) => {
    const res = await fetch(String(r.thumb), { method: 'HEAD' }).catch(() => null)
    return res && res.status === 404 ? r : null
  })).filter(Boolean)
  if (missing.length)
    await db.batch(missing.map(r => ({ sql: 'UPDATE cards SET image = NULL, thumb = NULL WHERE id = ? AND lang = ?', args: [r.id, r.lang] })), 'write')
  log(`  scans vérifiés : ${rows.length}, ${missing.length} absents chez TCGdex`)
}

async function main() {
  const t0 = Date.now()
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const work = workingCopy(DB_PATH)
  const db = work.db
  const version = (await db.execute('SELECT value FROM meta WHERE key = \'schema_version\'').catch(() => ({ rows: [] }))).rows[0]?.value
  if (version && version !== SCHEMA_VERSION) {
    log(`Schéma ${version} → ${SCHEMA_VERSION} : reconstruction complète`)
    await db.batch(['DROP TABLE IF EXISTS cards', 'DROP TABLE IF EXISTS sets', 'DROP TABLE IF EXISTS card_search'], 'write')
  }
  await db.batch(SCHEMA, 'write')

  log('Pokémon — TCGdex')
  let fetched = 0
  let failed = 0
  for (const lang of LANGS) {
    const briefs = await getJson(`${API}/${lang}/sets`)
    const known = new Map((await db.execute({ sql: 'SELECT code, signature FROM sets WHERE lang = ?', args: [lang] })).rows.map(r => [String(r.code), String(r.signature)]))
    // English after French: only the cards French does not have (the French
    // pass wrote the others in English too).
    const frIds = lang === 'en' ? new Set((await db.execute('SELECT id FROM cards WHERE lang = \'fr\'')).rows.map(r => String(r.id))) : null
    const todo = briefs.filter(b => !only || only.has(b.id))
    log(`  ${lang} : ${todo.length} extensions`)
    for (const b of todo) {
      const set = await getJson(`${API}/${lang}/sets/${encodeURIComponent(b.id)}`)
      if (!set)
        continue
      // TCGdex also lists Pokémon TCG Pocket, a video game with its own cards.
      if (set.serie?.id === 'tcgp') {
        if (known.has(set.id))
          await db.batch([{ sql: 'DELETE FROM cards WHERE set_code = ?', args: [set.id] }, { sql: 'DELETE FROM sets WHERE code = ?', args: [set.id] }], 'write')
        continue
      }
      const signature = JSON.stringify([set.cardCount, set.releaseDate, set.cards?.length])
      if (!force && known.get(set.id) === signature)
        continue
      const briefsToFetch = (set.cards ?? []).filter(c => lang === 'fr' || !frIds.has(c.id))
      // Each card in its language and, for a French one, in English too.
      const cards = (await mapPool(briefsToFetch, CONCURRENCY, async (brief) => {
        const url = l => `${API}/${l}/cards/${encodeURIComponent(brief.id)}`
        try {
          const [card, en] = await Promise.all([getJson(url(lang)), lang === 'en' ? null : getJson(url('en')).catch(() => null)])
          return card && { card, en: lang === 'en' ? card : en }
        }
        catch (e) {
          failed++
          console.error(`  ✗ ${brief.id} : ${e.message}`)
          return null
        }
      })).filter(Boolean)
      fetched += cards.length
      // The French pass writes both languages of a card (it has both in
      // hand); the English one adds the cards French does not have.
      const rows = cards.flatMap(({ card, en }) => lang === 'fr' && en ? [row(card, 'fr', en), row(en, 'en', en)] : [row(card, lang, en)])
      await db.batch([
        lang === 'fr'
          ? { sql: 'DELETE FROM cards WHERE set_code = ?', args: [set.id] }
          : { sql: 'DELETE FROM cards WHERE set_code = ? AND lang = \'en\' AND id NOT IN (SELECT id FROM cards WHERE lang = \'fr\')', args: [set.id] },
        ...rows,
        {
          sql: 'INSERT OR REPLACE INTO sets (code, lang, name, abbr, series, released, total, symbol, logo, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [set.id, lang, set.name, set.abbreviation?.official ?? null, set.serie?.name ?? null, set.releaseDate ?? null, set.cardCount?.total ?? rows.length, set.symbol ? `${set.symbol}.png` : null, set.logo ? `${set.logo}.png` : null, signature],
        },
      ], 'write')
      log(`  · ${set.id} (${lang}) : ${rows.length} cartes`)
    }
  }
  await refreshPrices(db)
  await dropMissingScans(db)
  await rebuildSearch(db)
  await db.batch([
    { sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (\'schema_version\', ?)', args: [SCHEMA_VERSION] },
    { sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (\'ingested_at\', ?)', args: [new Date().toISOString()] },
  ], 'write')
  const n = Number((await db.execute('SELECT COUNT(*) AS n FROM cards')).rows[0].n)
  work.commit()
  log(`✔ ${DB_PATH} — ${n} cartes · ${fetched} récupérées${failed ? ` · ${failed} en échec` : ''} · ${Math.round((Date.now() - t0) / 1000)} s`)
  // Some cards failing is tried again next night; nothing at all is a failure.
  process.exit(failed && !fetched ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
