#!/usr/bin/env node
/**
 * Riftbound ingestion — Riftcodex → local SQLite (scripts/tcg/schema.mjs),
 * with Cardmarket's public price guide (EUR).
 *
 * Source: https://api.riftcodex.com (every card, 100 a page, and the sets),
 * English only — Riot publishes no French card data; the unofficial French
 * rows come from scripts/translate-tcg.mjs (its cache is applied here). A printing is a card in a set,
 * variants included (alternate art, signature, overnumbered): "unl-116a-219".
 * The rules count copies by name, variants together.
 *
 * Prices: Cardmarket's product list and price guide (game 22) carry no
 * collector number, so a printing is matched by its name in its set: the
 * plain card takes its cheapest product of that name, a variant (alternate
 * art, showcase…) the dearest one.
 *
 * Small (1 500 cards): rebuilt whole each run, in a few seconds.
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { fold, getJson, mapPool, rebuildSearch, SCHEMA, SCHEMA_VERSION, workingCopy } from './tcg/schema.mjs'
import { applyTranslations, translationsDb } from './tcg/translations.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = process.env.RIFTBOUND_CARDS_DB ? resolve(process.env.RIFTBOUND_CARDS_DB) : resolve(ROOT, '.data/cards-riftbound.db')
const API = 'https://api.riftcodex.com'
const CARDMARKET = 'https://downloads.s3.cardmarket.com/productCatalog'
const log = (...a) => console.log(...a)

/** "Poppy - Paragon (Alternate Art)" → "Poppy - Paragon": the card the rules count. */
const baseName = name => String(name).replace(/\s*\([^)]*\)\s*$/, '').trim()
/** Cardmarket writes "Poppy, Paragon" where Riftcodex writes "Poppy - Paragon": compared without punctuation. */
const priceKey = name => fold(baseName(name)).replace(/[^\p{L}\d]+/gu, ' ').trim()

/** Rich text to lines: paragraphs and breaks become new lines, tags go. */
function plain(rich, fallback) {
  if (!rich)
    return fallback ?? null
  return rich
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, '\'')
    .replace(/\n{2,}/g, '\n')
    .trim() || null
}

async function prices() {
  try {
    const [products, guide] = await Promise.all([
      getJson(`${CARDMARKET}/productList/products_singles_22.json`),
      getJson(`${CARDMARKET}/priceGuide/price_guide_22.json`),
    ])
    const price = new Map((guide?.priceGuides ?? []).map(p => [p.idProduct, p]))
    // Products by their name without variant marks, each with its price.
    const byName = new Map()
    for (const p of products?.products ?? []) {
      const g = price.get(p.idProduct)
      const key = priceKey(p.name)
      const list = byName.get(key) ?? []
      list.push({ id: p.idProduct, expansion: p.idExpansion, price: g?.trend ?? g?.avg ?? null, foil: g?.['trend-foil'] || g?.['avg-foil'] || null })
      byName.set(key, list)
    }
    return byName
  }
  catch (e) {
    log(`  prix Cardmarket indisponibles : ${e.message}`)
    return new Map()
  }
}

async function main() {
  const t0 = Date.now()
  mkdirSync(dirname(DB_PATH), { recursive: true })
  log('Riftbound — Riftcodex')
  const first = await getJson(`${API}/cards?page=1&size=100`)
  const pages = Array.from({ length: Math.max(0, (first?.pages ?? 1) - 1) }, (_, i) => i + 2)
  const rest = await mapPool(pages, 4, p => getJson(`${API}/cards?page=${p}&size=100`))
  const cards = [first, ...rest].flatMap(r => r?.items ?? [])
  const sets = (await getJson(`${API}/sets`))?.items ?? []
  const byName = await prices()
  log(`  ${cards.length} cartes, ${sets.length} extensions, ${byName.size} noms chez Cardmarket`)
  if (!cards.length)
    throw new Error('Riftcodex n\'a renvoyé aucune carte')

  // A set's Cardmarket expansions (Riftcodex gives one id, a list or none).
  const expansions = new Map(sets.map(s => [s.set_id, new Set([s.cardmarket_id ?? []].flat().map(Number))]))

  const work = workingCopy(DB_PATH)
  const db = work.db
  await db.batch(['DROP TABLE IF EXISTS cards', 'DROP TABLE IF EXISTS sets', 'DROP TABLE IF EXISTS aliases', 'DROP TABLE IF EXISTS card_search', ...SCHEMA], 'write')

  const rows = []
  const seen = new Set()
  for (const c of cards) {
    const cls = c.classification ?? {}
    // Tokens are never put in a deck, nor collected.
    if (cls.supertype === 'Token')
      continue
    // "unl-116a-219": set, number (a letter or * for variants), the set's size
    // of reference — which tells promos apart, several sharing a number.
    let id = String(c.riftbound_id ?? '').toLowerCase().replace(/\*/g, 's')
    if (!id)
      continue
    // Riftcodex gives some printings the id of another: the Metal Miss Fortune
    // shares "opp-267-298" with the plain one. A second printing with a mark
    // of its own ("(Metal)") gets its own id, its mark's letter after the
    // number ("opp-267m-298"); a plain duplicate is the same card twice.
    if (seen.has(id)) {
      const mark = /\(([^)]+)\)\s*$/.exec(c.name)?.[1]
      if (!mark)
        continue
      const [set, num, total] = id.split('-')
      const letters = mark.toLowerCase().replace(/[^a-z]/g, '')
      id = [1, 2, 3].map(n => `${set}-${num}${letters.slice(0, n)}-${total}`).find(x => !seen.has(x)) ?? ''
      if (!id)
        continue
    }
    seen.add(id)
    const number = id.split('-')[1] ?? String(c.collector_number)
    const meta = c.metadata ?? {}
    const variant = meta.alternate_art || meta.overnumbered || /\(/.test(c.name) || cls.rarity === 'Showcase'
    const wanted = expansions.get(c.set?.set_id) ?? new Set()
    const products = (byName.get(priceKey(c.name)) ?? []).filter(p => !wanted.size || wanted.has(p.expansion))
    const priced = products.filter(p => p.price != null && p.price > 0).sort((a, b) => a.price - b.price)
    const pick = variant ? priced.at(-1) : priced[0]
    const image = c.media?.image_url ? String(c.media.image_url).split('?')[0] : null
    const stats = {}
    for (const k of ['energy', 'might', 'power']) {
      if (c.attributes?.[k] != null)
        stats[k] = Number(c.attributes[k])
    }
    rows.push({
      sql: `INSERT OR REPLACE INTO cards (id, lang, card_key, code, name, name_en, name_folded, number, set_code, rarity, category, subtype, types, stats, text, image, thumb, finishes, price_eur, price_eur_foil, cardmarket_id, regulation, legal, banned, extra)
            VALUES (?, 'en', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, ?, ?, ?, NULL, '["standard"]', 0, ?)`,
      args: [
        id,
        fold(baseName(c.name)),
        c.tcgplayer_id ? String(c.tcgplayer_id) : null,
        c.name,
        c.name,
        fold(c.name),
        number,
        String(c.set?.set_id ?? '').toUpperCase(),
        cls.rarity ?? null,
        cls.type ?? 'Unit',
        cls.supertype ?? null,
        JSON.stringify(cls.domain ?? []),
        JSON.stringify(stats),
        plain(c.text?.rich, c.text?.plain),
        image,
        image,
        pick?.price ?? null,
        pick?.foil ?? null,
        pick?.id ?? null,
        JSON.stringify({
          illustrator: c.media?.artist ?? null,
          tags: c.tags ?? [],
          flavour: c.text?.flavour ?? null,
          landscape: c.orientation === 'landscape',
          signature: !!meta.signature,
          variant,
        }),
      ],
    })
  }
  for (let i = 0; i < rows.length; i += 500)
    await db.batch(rows.slice(i, i + 500), 'write')
  await db.batch(sets.map(s => ({
    sql: 'INSERT OR REPLACE INTO sets (code, lang, name, abbr, series, released, total, symbol, logo, signature) VALUES (?, \'en\', ?, ?, NULL, ?, ?, NULL, NULL, NULL)',
    args: [String(s.set_id).toUpperCase(), s.name, String(s.set_id).toUpperCase(), s.published_on ? String(s.published_on).slice(0, 10) : null, Number(s.card_count ?? 0)],
  })), 'write')
  // The unofficial French kept so far (scripts/translate-tcg.mjs).
  const tdb = translationsDb(resolve(dirname(DB_PATH), 'translations-riftbound.db'))
  const french = await applyTranslations(db, tdb)
  tdb.close()
  if (french)
    log(`  ${french} cartes en français (traduction non officielle)`)
  await rebuildSearch(db)
  await db.batch([
    { sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (\'schema_version\', ?)', args: [SCHEMA_VERSION] },
    { sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (\'ingested_at\', ?)', args: [new Date().toISOString()] },
  ], 'write')
  const priced = rows.filter(r => r.args[16] != null).length
  work.commit()
  log(`✔ ${DB_PATH} — ${rows.length} impressions, ${priced} avec un prix · ${Math.round((Date.now() - t0) / 1000)} s`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
