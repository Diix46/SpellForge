#!/usr/bin/env node
/**
 * Smoke test for the local One Piece database.
 *
 * Beyond volume, this asserts the three normalisations the rules engine depends
 * on and that no schema can express: a Leader's Life is stored in Life (not in
 * cost), parallel arts collapse onto one card number for the 4-copy rule, and
 * block numbers are present so rotation can be computed.
 *
 * Usage:  npm run cards:verify:op
 */
import { statSync } from 'node:fs'
import process from 'node:process'
import { createClient } from '@libsql/client'

const DB = '.data/cards-optcg.db'
const db = createClient({ url: `file:${DB}` })
const q = async (sql, args = []) => (await db.execute({ sql, args })).rows
const one = async (sql, args = []) => Object.values((await q(sql, args))[0] ?? {})[0]
async function time(label, sql, args = []) {
  const t = process.hrtime.bigint()
  const r = await q(sql, args)
  console.log(`  ${label.padEnd(44)} ${(Number(process.hrtime.bigint() - t) / 1e6).toFixed(1).padStart(6)} ms   ${r.length} lignes`)
  return r
}

console.log('\n── VOLUMÉTRIE ──────────────────────────────────────────────')
console.log('  fichier                   ', `${(statSync(DB).size / 1048576).toFixed(1)} Mo`)
for (const r of await q(`SELECT lang, COUNT(*) n, COUNT(DISTINCT card_number) d FROM op_cards GROUP BY lang`))
  console.log(`  ${r.lang}  ${String(r.n).padStart(5)} impressions · ${r.d} numéros distincts (les alt-arts fusionnent)`)
console.log('  extensions                ', await one('SELECT COUNT(*) FROM op_packs'))

console.log('\n── NORMALISATIONS CRITIQUES ────────────────────────────────')
const badLeader = await one(`SELECT COUNT(*) FROM op_cards WHERE category='Leader' AND (life IS NULL OR cost IS NOT NULL)`)
console.log(`  Leaders avec Vie correcte   ${badLeader === 0 ? '✔ tous' : `✖ ${badLeader} en défaut`}  (punk-records range la Vie dans "cost")`)
const badOther = await one(`SELECT COUNT(*) FROM op_cards WHERE category!='Leader' AND life IS NOT NULL`)
console.log(`  Non-Leaders sans Vie        ${badOther === 0 ? '✔ tous' : `✖ ${badOther} en défaut`}`)
for (const id of ['OP01-001', 'OP02-001']) {
  const r = (await q(`SELECT name, category, life, power, colors, attributes, lang FROM op_cards WHERE card_number=? AND lang='en' LIMIT 1`, [id]))[0]
  console.log(`  ${id}  ${r ? `${r.name} — ${r.category}, Vie ${r.life}, Force ${r.power}, ${JSON.parse(r.colors).join('/')}, ${JSON.parse(r.attributes).join('/')}` : 'introuvable'}`)
}

console.log('\n── LÉGALITÉ ────────────────────────────────────────────────')
console.log('  cartes bannies marquées   ', await one(`SELECT COUNT(DISTINCT card_number) FROM op_cards WHERE is_banned=1`), '(attendu : 5)')
const blocks = await q(`SELECT block_number b, COUNT(DISTINCT card_number) n FROM op_cards WHERE lang='en' GROUP BY b ORDER BY b`)
console.log('  répartition par bloc      ', blocks.map(r => `bloc ${r.b ?? '—'} : ${r.n}`).join(' · '))
const rot = await one(`SELECT COUNT(DISTINCT card_number) FROM op_cards WHERE lang='en' AND block_number>=2`)
const all = await one(`SELECT COUNT(DISTINCT card_number) FROM op_cards WHERE lang='en'`)
console.log(`  pool Standard 2026-27      ${rot} / ${all} numéros légaux (bloc 2+)`)

console.log('\n── COUVERTURE FRANÇAISE ────────────────────────────────────')
const frN = await one(`SELECT COUNT(DISTINCT card_number) FROM op_cards WHERE lang='fr'`)
console.log(`  numéros en VF              ${frN} / ${all}  (${(frN / all * 100).toFixed(1)} %) — repli EN obligatoire`)
const noFr = await q(`SELECT DISTINCT set_code FROM op_cards WHERE lang='en' AND set_code NOT IN
                      (SELECT DISTINCT set_code FROM op_cards WHERE lang='fr') ORDER BY set_code LIMIT 12`)
console.log('  extensions sans VF        ', noFr.map(r => r.set_code).join(' '))

console.log('\n── REQUÊTES DU DECKBUILDER ─────────────────────────────────')
const leaderMask = await one(`SELECT color_mask FROM op_cards WHERE card_number='OP01-001' AND lang='en' LIMIT 1`)
await time('cartes jouables sous ce leader', `SELECT card_number FROM op_cards WHERE lang='en' AND category!='Leader'
     AND color_mask!=0 AND (color_mask & ~?)=0 AND block_number>=2 AND is_banned=0
   GROUP BY card_number LIMIT 50`, [leaderMask])
await time('grille : couleur + catégorie + coût', `SELECT card_number, name FROM op_cards WHERE lang='fr' AND category='Character' AND cost<=3 GROUP BY card_number LIMIT 30`)
const fts = await time('recherche FR sans accent : "equipage"', `SELECT c.name FROM op_search s JOIN op_cards c ON c.id=s.id AND c.lang=s.lang
   WHERE op_search MATCH 'equipage' AND c.lang='fr' LIMIT 5`)
console.log('   →', fts.slice(0, 3).map(r => r.name).join(' · ') || '(aucun)')

console.log('\n── FRAÎCHEUR ───────────────────────────────────────────────')
for (const r of await q('SELECT key, value FROM meta'))
  console.log(`  ${r.key.padEnd(17)} ${/^\d+$/.test(r.value) ? new Date(+r.value * 1000).toISOString() : r.value}`)
console.log()
