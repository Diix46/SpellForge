#!/usr/bin/env node
/**
 * Smoke test for the local card database.
 *
 * Checks volume, correctness against known Scryfall figures, and the latency of
 * the four query shapes the app actually depends on. Run it after every ingest:
 * a database that builds without error can still be subtly wrong (NULL ordering,
 * a missing rollup, an FTS tokenizer that ignores accents).
 *
 * Usage:  npm run cards:verify
 */
import { statSync } from 'node:fs'
import process from 'node:process'
import { createClient } from '@libsql/client'

const DB = '.data/cards-mtg.db'
const db = createClient({ url: `file:${DB}` })
const q = async (sql, args = []) => (await db.execute({ sql, args })).rows
const one = async (sql, args = []) => Object.values((await q(sql, args))[0] ?? {})[0]
async function time(label, sql, args = []) {
  const t = process.hrtime.bigint()
  const r = await q(sql, args)
  const ms = Number(process.hrtime.bigint() - t) / 1e6
  console.log(`  ${label.padEnd(44)} ${ms.toFixed(1).padStart(7)} ms   ${r.length} lignes`)
  return r
}

console.log('\n── VOLUMÉTRIE ──────────────────────────────────────────────')
console.log('  fichier                  ', `${(statSync(DB).size / 1048576).toFixed(1)} Mo`)
console.log('  cartes distinctes        ', await one('SELECT COUNT(*) FROM oracle_cards'))
console.log('  impressions              ', await one('SELECT COUNT(*) FROM printings'))
for (const r of await q('SELECT lang, COUNT(*) n FROM printings GROUP BY lang ORDER BY n DESC'))
  console.log(`    ${r.lang}                     `, r.n)
console.log('  faces recto/verso        ', await one('SELECT COUNT(*) FROM card_faces'))
console.log('  jetons associés          ', await one('SELECT COUNT(*) FROM card_parts'))
console.log('  lignes indexées FTS      ', await one('SELECT COUNT(*) FROM card_search'))

console.log('\n── JUSTESSE (vs chiffres Scryfall connus) ──────────────────')
console.log(`  legal:commander            ${await one('SELECT COUNT(*) FROM oracle_cards WHERE legal_commander=1')}   (Scryfall : 31 830)`)
const cmd = await one('SELECT COUNT(*) FROM oracle_cards WHERE is_commander=1')
console.log(`  is:commander dérivé        ${cmd}    (Scryfall : 3 730 → rappel ${(cmd / 3730 * 100).toFixed(1)} %)`)
console.log(`  cartes ayant une VF        ${await one(`SELECT COUNT(DISTINCT oracle_id) FROM printings WHERE lang='fr'`)}`)
const wp = await one('SELECT COUNT(*) FROM oracle_cards WHERE min_price_eur IS NOT NULL')
const tot = await one('SELECT COUNT(*) FROM oracle_cards')
console.log(`  rollup prix EUR            ${wp} / ${tot}  (${(wp / tot * 100).toFixed(1)} %)`)

console.log('\n── LA REQUÊTE QUI REMPLACE 5 APPELS RÉSEAU ─────────────────')
const oid = await one(`SELECT oracle_id FROM oracle_cards WHERE name LIKE 'Atraxa, Praetors%' LIMIT 1`)
const best = await time('meilleure impression FR d\'une carte', `SELECT set_code, collector_number, printed_name, image_status FROM printings
   WHERE oracle_id=? AND lang='fr' AND is_real_image=1
   ORDER BY is_highres DESC, released_at DESC LIMIT 1`, [oid])
console.log('   →', best[0] ? `${best[0].printed_name} [${best[0].set_code} ${best[0].collector_number}, ${best[0].image_status}]` : 'aucune VF')

console.log('\n── NAVIGATION PAR DÉFAUT (la requête la plus chaude) ───────')
const browse = await time('identité ⊆ WUBG + légal + tri EDHREC', `SELECT name, edhrec_rank FROM oracle_cards
   WHERE (identity_mask & ~23)=0 AND legal_commander=1 AND is_extra=0 AND is_funny=0
   ORDER BY edhrec_rank IS NULL, edhrec_rank LIMIT 10`)
console.log('   →', browse.slice(0, 3).map(r => `${r.name} (#${r.edhrec_rank})`).join(' · '))
await time('… + cmc<=4 + budget ≤ 5 €', `SELECT name FROM oracle_cards
   WHERE (identity_mask & ~23)=0 AND legal_commander=1 AND cmc<=4
     AND min_price_eur<=5 AND is_extra=0
   ORDER BY edhrec_rank IS NULL, edhrec_rank LIMIT 20`)

console.log('\n── RECHERCHE PLEIN TEXTE ───────────────────────────────────')
const fts = await time('oracle:"draw a card" (thème Pioche)', `SELECT o.name FROM card_search s JOIN oracle_cards o ON o.oracle_id=s.oracle_id
   WHERE card_search MATCH '"draw a card"' AND o.legal_commander=1
   ORDER BY o.edhrec_rank IS NULL, o.edhrec_rank LIMIT 10`)
console.log('   →', fts.slice(0, 3).map(r => r.name).join(' · '))
const acc = await time('recherche FR sans accent : "eclaireur"', `SELECT printed_name FROM card_search WHERE card_search MATCH 'eclaireur' LIMIT 5`)
console.log('   →', acc.map(r => r.printed_name).filter(Boolean).slice(0, 3).join(' · ') || '(aucun)')

console.log('\n── IMPRESSION ÉPINGLÉE ─────────────────────────────────────')
const pin = await time('lookup (set, numéro, langue)', `SELECT p.printed_name, o.name FROM printings p JOIN oracle_cards o ON o.oracle_id=p.oracle_id
   WHERE p.set_code='m21' AND p.collector_number='177' AND p.lang='fr'`)
console.log('   →', pin[0] ? `${pin[0].printed_name ?? '—'}  (EN : ${pin[0].name})` : 'introuvable')

console.log('\n── FRAÎCHEUR ───────────────────────────────────────────────')
for (const r of await q('SELECT key, value FROM meta')) console.log(`  ${r.key.padEnd(17)} ${r.value}`)
console.log()
