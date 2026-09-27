#!/usr/bin/env node
/**
 * Riftbound in French, unofficially: Riot prints the game in English only
 * (even its French card gallery shows English cards). Each card's name, rules
 * text and flavour not translated yet goes to Claude, 25 at a time, with the
 * game's keywords fixed by a glossary so every card says them the same way;
 * the answers are kept (scripts/tcg/translations.mjs), then written into the
 * card database as French rows, marked unofficial.
 *
 * Needs ANTHROPIC_API_KEY (the coach's key); without it, only the translations
 * already kept are applied. Usage: node scripts/translate-riftbound.mjs [--limit 50]
 */
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { rebuildSearch, workingCopy } from './tcg/schema.mjs'
import { applyTranslations, ensureTranslations, sourceOf, translationsDb } from './tcg/translations.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = process.env.RIFTBOUND_CARDS_DB ? resolve(process.env.RIFTBOUND_CARDS_DB) : resolve(ROOT, '.data/cards-riftbound.db')
const TR_PATH = resolve(dirname(DB_PATH), 'translations-riftbound.db')
const MODEL = 'claude-sonnet-5'
const BATCH = 25
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity
const log = (...a) => console.log(...a)

/** The game's words, as every translated card must say them. */
export const GLOSSARY = {
  'Accelerate': 'Accélération',
  'Action': 'Action',
  'Assault': 'Assaut',
  'Deathknell': 'Glas',
  'Deflect': 'Déviation',
  'Equip': 'Équipement',
  'Ganking': 'Embuscade',
  'Hidden': 'Dissimulé',
  'Legion': 'Légion',
  'Quick-Draw': 'Dégainer',
  'Reaction': 'Réaction',
  'Shield': 'Bouclier',
  'Tank': 'Tank',
  'Temporary': 'Temporaire',
  'Vision': 'Vision',
  'Weaponmaster': 'Maître d\'armes',
  'Unique': 'Unique',
  'Legend': 'Légende',
  'Champion': 'Champion',
  'Chosen Champion': 'Champion choisi',
  'Signature': 'Signature',
  'Battlefield': 'Champ de bataille',
  'Rune': 'Rune',
  'Unit': 'Unité',
  'Spell': 'Sort',
  'Gear': 'Équipement',
  'Token': 'Jeton',
  'Might': 'Puissance',
  'Energy': 'Énergie',
  'Power': 'Essence runique',
  'XP': 'XP',
  'conquer': 'conquérir',
  'hold': 'tenir',
  'Showdown': 'Affrontement',
  'Combat': 'Combat',
  'Recycle': 'Recycler',
  'Channel': 'Canaliser',
  'Exhaust': 'Épuiser',
  'Ready': 'Préparer',
  'Stun': 'Étourdir',
  'Buff': 'Renforcer',
  'Score': 'Score',
  'Victory Score': 'Score de victoire',
  'Base': 'Base',
  'Trash': 'Défausse',
  'Main Deck': 'Deck principal',
  'Rune Deck': 'Deck de runes',
  'Fury': 'Fureur',
  'Calm': 'Calme',
  'Mind': 'Esprit',
  'Body': 'Corps',
  'Chaos': 'Chaos',
  'Order': 'Ordre',
}

const SYSTEM = `Tu traduis des cartes du jeu de cartes Riftbound (League of Legends) de l'anglais vers le français, pour des joueurs francophones.
Règles :
- Les noms de champions et de lieux de Runeterra restent tels quels (Jinx, Viktor, Piltover, Zaun, Demacia…) ; traduis le reste du nom (« Jinx - Loose Cannon » → « Jinx - Canon déchaîné »), dans le ton de League of Legends en français.
- Les mots-clés du jeu suivent ce glossaire, toujours, crochets compris (« [Assault 2] » → « [Assaut 2] ») : ${Object.entries(GLOSSARY).map(([en, fr]) => `${en} → ${fr}`).join(' ; ')}.
- Garde tels quels les symboles et marqueurs : [S], [C], [1], [R], :rb_…:, les nombres, les retours à la ligne.
- Le texte de règles est précis et impersonnel comme sur une carte française de jeu (« Quand vous jouez cette carte, piochez 1. ») ; le texte d'ambiance garde sa voix.
Réponds uniquement par un tableau JSON, un objet par carte dans l'ordre reçu : {"id": …, "name": …, "text": …, "flavour": …} (text et flavour à null quand la carte n'en a pas).`

async function translate(batch, key) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(batch.map(c => ({ id: c.hash, name: c.name, text: c.text, flavour: c.flavour }))) }],
    }),
  })
  if (!res.ok)
    throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = await res.json()
  const out = body.content?.map(p => p.text ?? '').join('') ?? ''
  const json = out.slice(out.indexOf('['), out.lastIndexOf(']') + 1)
  return JSON.parse(json)
}

async function main() {
  const t0 = Date.now()
  const cards = createClient({ url: `file:${DB_PATH}` })
  const tdb = translationsDb(TR_PATH)
  await ensureTranslations(tdb)
  const { rows } = await cards.execute('SELECT name, text, extra FROM cards WHERE lang = \'en\'')
  cards.close()
  const known = new Set((await tdb.execute('SELECT hash FROM translations')).rows.map(r => String(r.hash)))
  const todo = [...new Map(rows.map(r => sourceOf(r)).filter(s => !known.has(s.hash)).map(s => [s.hash, s])).values()].slice(0, LIMIT)
  log(`Riftbound en français — ${known.size} cartes déjà traduites, ${todo.length} à traduire`)

  const key = process.env.ANTHROPIC_API_KEY
  let done = 0
  let failed = 0
  if (todo.length && !key)
    log('  ANTHROPIC_API_KEY absente : seules les traductions déjà gardées sont appliquées')
  const batches = key ? Math.ceil(todo.length / BATCH) : 0
  for (let n = 0; n < batches; n++) {
    const i = n * BATCH
    const batch = todo.slice(i, i + BATCH)
    try {
      const out = await translate(batch, key)
      const byId = new Map(out.map(o => [o.id, o]))
      const stmts = batch.flatMap((c) => {
        const o = byId.get(c.hash)
        if (!o?.name)
          return []
        return [{ sql: 'INSERT OR REPLACE INTO translations (hash, name, text, flavour, model, at) VALUES (?, ?, ?, ?, ?, ?)', args: [c.hash, o.name, c.text == null ? null : o.text ?? null, c.flavour == null ? null : o.flavour ?? null, MODEL, new Date().toISOString()] }]
      })
      if (stmts.length)
        await tdb.batch(stmts, 'write')
      done += stmts.length
      failed += batch.length - stmts.length
      log(`  · ${done} / ${todo.length}`)
    }
    catch (e) {
      failed += batch.length
      console.error(`  ✗ lot ${i / BATCH + 1} : ${e.message}`)
    }
  }

  // Into the card database, through a working copy as the ingest does.
  const work = workingCopy(DB_PATH)
  const written = await applyTranslations(work.db, tdb)
  await rebuildSearch(work.db)
  work.commit()
  tdb.close()
  log(`✔ ${written} cartes en français (${done} traduites maintenant${failed ? `, ${failed} en échec` : ''}) · ${Math.round((Date.now() - t0) / 1000)} s`)
  // Some cards failing is tried again next night; everything failing with a key is a failure.
  process.exit(key && todo.length && !done ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
