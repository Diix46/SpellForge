#!/usr/bin/env node
/**
 * Are the cards Prism shows the real ones? A sample of each card database,
 * checked card by card against its source: the name, the set and number, the
 * image (it must answer), the price (the same order of magnitude). Scryfall
 * for Magic, TCGdex for Pokémon, YGOPRODeck for Yu-Gi-Oh!, Riftcodex for
 * Riftbound; One Piece is a mirror of Bandai's list (punk-records): its
 * numbers and images are checked, as nothing else holds it to account.
 *
 * Usage: node scripts/audit-cards.mjs [--games mtg,pokemon] [--sample 60] [--json out.json]
 * Exit 1 when a game's error rate is over 2 %.
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { mapPool } from './tcg/schema.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const GAMES = arg('games', 'mtg,optcg,pokemon,yugioh,riftbound').split(',')
const SAMPLE = Number(arg('sample', '60'))
const OUT = arg('json', null)
const UA = 'Prism-audit/1.0 (+https://github.com/Diix46/SpellForge)'
const db = name => createClient({ url: `file:${resolve(ROOT, `.data/cards-${name}.db`)}` })
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function json(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } }).catch(() => null)
    if (res?.ok)
      return res.json()
    if (res && res.status === 404)
      return null
    await sleep(800 * (i + 1))
  }
  throw new Error(`${url} ne répond pas`)
}
async function imageOk(url) {
  if (!url)
    return false
  const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } }).catch(() => null)
  return !!res?.ok
}
const same = (a, b) => String(a ?? '').normalize('NFC').trim().toLowerCase() === String(b ?? '').normalize('NFC').trim().toLowerCase()
/** Prices move daily: only a factor of three apart, or one missing, is a finding. */
const priceOff = (ours, theirs) => (ours == null) !== (theirs == null) ? 'absent d\'un côté' : ours != null && theirs != null && theirs > 0.5 && (ours / theirs > 3 || theirs / ours > 3) ? `${ours} € contre ${theirs} €` : null

// ---- One check per game: [issue, …] for one card ----

const checks = {
  async mtg() {
    const { rows } = await db('mtg').execute({
      sql: `SELECT p.id, p.lang, p.set_code, p.collector_number, p.printed_name, p.price_eur, p.img_version, o.name
              FROM printings p JOIN oracle_cards o USING (oracle_id)
             WHERE p.is_real_image = 1 ORDER BY random() LIMIT ?`,
      args: [SAMPLE],
    })
    return mapPool(rows, 4, async (r) => {
      await sleep(120) // Scryfall asks for 10 requests a second at most.
      const s = await json(`https://api.scryfall.com/cards/${r.id}`)
      if (!s)
        return { id: r.id, issues: ['introuvable chez Scryfall'] }
      const issues = []
      if (!same(s.name, r.name))
        issues.push(`nom « ${r.name} » ≠ « ${s.name} »`)
      if (!same(s.set, r.set_code) || !same(s.collector_number, r.collector_number))
        issues.push(`impression ${r.set_code} #${r.collector_number} ≠ ${s.set} #${s.collector_number}`)
      if (r.lang === 'fr' && s.printed_name && r.printed_name && !same(s.printed_name, r.printed_name))
        issues.push(`nom FR « ${r.printed_name} » ≠ « ${s.printed_name} »`)
      const p = priceOff(r.price_eur == null ? null : Number(r.price_eur), s.prices?.eur == null ? null : Number(s.prices.eur))
      if (p)
        issues.push(`prix : ${p}`)
      if (!await imageOk(s.image_uris?.small ?? s.card_faces?.[0]?.image_uris?.small))
        issues.push('image absente')
      return { id: `${r.id} (${r.name})`, issues }
    })
  },

  async pokemon() {
    const { rows } = await db('pokemon').execute({ sql: 'SELECT id, lang, name, number, set_code, thumb, price_eur FROM cards ORDER BY random() LIMIT ?', args: [SAMPLE] })
    return mapPool(rows, 6, async (r) => {
      const s = await json(`https://api.tcgdex.net/v2/${r.lang}/cards/${encodeURIComponent(r.id)}`)
      if (!s)
        return { id: r.id, issues: [`introuvable chez TCGdex (${r.lang})`] }
      const issues = []
      if (!same(s.name, r.name))
        issues.push(`nom « ${r.name} » ≠ « ${s.name} »`)
      if (!same(s.localId, r.number) || !same(s.set?.id, r.set_code))
        issues.push(`numéro ${r.set_code} #${r.number} ≠ ${s.set?.id} #${s.localId}`)
      const p = priceOff(r.price_eur == null ? null : Number(r.price_eur), s.pricing?.cardmarket?.avg ?? s.pricing?.cardmarket?.trend ?? null)
      if (p)
        issues.push(`prix : ${p}`)
      if (r.thumb && !await imageOk(r.thumb))
        issues.push('image absente')
      return { id: `${r.id} ${r.lang} (${r.name})`, issues }
    })
  },

  async yugioh() {
    const { rows } = await db('yugioh').execute({ sql: 'SELECT id, code, name, set_code, number, rarity, thumb FROM cards WHERE lang = \'en\' ORDER BY random() LIMIT ?', args: [SAMPLE] })
    return mapPool(rows, 4, async (r) => {
      await sleep(80) // YGOPRODeck: 20 requests a second at most.
      const found = await json(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(r.code)}`)
      const s = found?.data?.[0]
      if (!s)
        return { id: r.id, issues: ['introuvable chez YGOPRODeck'] }
      const issues = []
      if (!same(s.name, r.name))
        issues.push(`nom « ${r.name} » ≠ « ${s.name} »`)
      const code = `${r.set_code}-${r.number}`
      const prints = (s.card_sets ?? []).filter(p => same(p.set_code, code))
      if (!prints.length)
        issues.push(`impression ${code} absente de la carte`)
      else if (r.rarity && !prints.some(p => same(p.set_rarity, r.rarity)))
        issues.push(`rareté « ${r.rarity} » ≠ ${prints.map(p => p.set_rarity).join(' / ')}`)
      if (r.thumb && !await imageOk(r.thumb))
        issues.push('image absente')
      return { id: `${r.id} (${r.name})`, issues }
    })
  },

  async riftbound() {
    const pages = []
    const first = await json('https://api.riftcodex.com/cards?page=1&size=100')
    pages.push(...(first?.items ?? []))
    for (let p = 2; p <= (first?.pages ?? 1); p++)
      pages.push(...((await json(`https://api.riftcodex.com/cards?page=${p}&size=100`))?.items ?? []))
    const byId = new Map(pages.map(c => [String(c.riftbound_id ?? '').toLowerCase().replace(/\*/g, 's'), c]))
    const { rows } = await db('riftbound').execute({ sql: 'SELECT id, name, number, set_code, thumb FROM cards WHERE lang = \'en\' ORDER BY random() LIMIT ?', args: [SAMPLE] })
    return mapPool(rows, 6, async (r) => {
      const s = byId.get(String(r.id))
      if (!s)
        return { id: r.id, issues: ['introuvable chez Riftcodex'] }
      const issues = []
      if (!same(s.name, r.name))
        issues.push(`nom « ${r.name} » ≠ « ${s.name} »`)
      if (!same(s.set?.set_id, r.set_code))
        issues.push(`extension ${r.set_code} ≠ ${s.set?.set_id}`)
      if (r.thumb && !await imageOk(r.thumb))
        issues.push('image absente')
      return { id: `${r.id} (${r.name})`, issues }
    })
  },

  async optcg() {
    const { rows } = await db('optcg').execute({ sql: 'SELECT id, lang, card_number, name, pack_id, img_version FROM op_cards ORDER BY random() LIMIT ?', args: [SAMPLE] })
    const base = 'https://raw.githubusercontent.com/buhbbl/punk-records/main'
    const packs = new Map()
    return mapPool(rows, 4, async (r) => {
      const lang = r.lang === 'fr' ? 'french' : 'english'
      const key = `${lang}/${r.pack_id}`
      if (!packs.has(key))
        packs.set(key, json(`${base}/${lang}/data/${r.pack_id}.json`).catch(() => null))
      const list = await packs.get(key)
      const s = list?.find(c => c.id === r.id)
      if (!s)
        return { id: r.id, issues: [`absente de l'extension ${r.pack_id} (${lang})`] }
      const issues = []
      if (!same(s.name, r.name) && !same(s.name?.replace(/&amp;/g, '&'), r.name))
        issues.push(`nom « ${r.name} » ≠ « ${s.name} »`)
      if (!String(r.id).startsWith(String(r.card_number)))
        issues.push(`numéro ${r.card_number} incohérent avec ${r.id}`)
      if (!await imageOk(s.img_full_url))
        issues.push('image absente chez Bandai')
      return { id: `${r.id} ${r.lang} (${r.name})`, issues }
    })
  },
}

const report = {}
let failed = false
for (const game of GAMES) {
  const t0 = Date.now()
  const results = await checks[game]().catch(e => [{ id: '—', issues: [`audit impossible : ${e.message}`] }])
  const bad = results.filter(r => r.issues.length)
  const rate = results.length ? bad.length / results.length : 1
  report[game] = { checked: results.length, bad: bad.length, rate, issues: bad }
  console.log(`\n${game} — ${results.length} cartes, ${bad.length} avec écart (${(rate * 100).toFixed(1)} %) · ${Math.round((Date.now() - t0) / 1000)} s`)
  for (const b of bad)
    console.log(`  ✗ ${b.id} : ${b.issues.join(' ; ')}`)
  if (rate > 0.02)
    failed = true
}
if (OUT)
  writeFileSync(OUT, JSON.stringify(report, null, 2))
process.exit(failed ? 1 : 0)
