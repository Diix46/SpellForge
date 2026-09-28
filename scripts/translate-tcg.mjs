#!/usr/bin/env node
/**
 * Cards in French, unofficially, for what the publisher does not print in
 * French: all of Riftbound (Riot prints it in English only), and the newest
 * Yu-Gi-Oh! cards (YGOPRODeck has no French text for them yet). Each card's
 * name, rules text and flavour not translated yet goes to Claude, 10 at a
 * time, with the game's keywords fixed by a glossary so every card says them
 * the same way; the answers are kept (scripts/tcg/translations.mjs), then
 * written into the card database as French rows, marked unofficial.
 *
 * Needs ANTHROPIC_API_KEY (the coach's key); without it, only the translations
 * already kept are applied.
 * Usage: node scripts/translate-tcg.mjs <riftbound|yugioh> [--limit 50] [--reset]
 */
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { rebuildSearch, workingCopy } from './tcg/schema.mjs'
import { TRANSLATED_GAMES } from './tcg/translation-games.mjs'
import { applyTranslations, ensureTranslations, sourceOf, translationsDb } from './tcg/translations.mjs'

const GAME = process.argv[2]
const CONFIG = TRANSLATED_GAMES[GAME]
if (!CONFIG) {
  console.error(`Jeu inconnu : ${GAME} (${Object.keys(TRANSLATED_GAMES).join(', ')})`)
  process.exit(1)
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENV = `${GAME.toUpperCase()}_CARDS_DB`
const DB_PATH = process.env[ENV] ? resolve(process.env[ENV]) : resolve(ROOT, `.data/cards-${GAME}.db`)
const TR_PATH = resolve(dirname(DB_PATH), `translations-${GAME}.db`)
const MODEL = 'claude-sonnet-5'
const BATCH = 10
// --reset: translate everything again (a prompt or glossary change).
const RESET = process.argv.includes('--reset')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity
const log = (...a) => console.log(...a)

async function translate(batch, key) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: CONFIG.system,
      messages: [{ role: 'user', content: JSON.stringify(batch.map(c => ({ id: c.hash, name: c.name, text: c.text, flavour: c.flavour }))) }],
    }),
  })
  if (!res.ok)
    throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = await res.json()
  const out = body.content?.filter(p => p.type === 'text').map(p => p.text ?? '').join('') ?? ''
  const json = out.slice(out.indexOf('['), out.lastIndexOf(']') + 1)
  if (!json)
    throw new Error(`réponse sans JSON (${body.stop_reason}, ${(body.content ?? []).map(p => p.type).join(',')}) : ${out.slice(0, 160)}`)
  return JSON.parse(json)
}

async function main() {
  const t0 = Date.now()
  const cards = createClient({ url: `file:${DB_PATH}` })
  const tdb = translationsDb(TR_PATH)
  await ensureTranslations(tdb)
  if (RESET)
    await tdb.execute('DELETE FROM translations')
  const { rows } = await cards.execute(CONFIG.onlyMissing
    // The cards without any French row: those YGOPRODeck has no text for.
    ? 'SELECT name, text, extra FROM cards e WHERE lang = \'en\' AND NOT EXISTS (SELECT 1 FROM cards f WHERE f.card_key = e.card_key AND f.lang = \'fr\' AND f.extra NOT LIKE \'%"translated":true%\')'
    : 'SELECT name, text, extra FROM cards WHERE lang = \'en\'')
  cards.close()
  const known = new Set((await tdb.execute('SELECT hash FROM translations')).rows.map(r => String(r.hash)))
  const todo = [...new Map(rows.map(r => sourceOf(r)).filter(s => !known.has(s.hash)).map(s => [s.hash, s])).values()].slice(0, LIMIT)
  log(`${CONFIG.label} en français — ${known.size} cartes déjà traduites, ${todo.length} à traduire`)

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
  const written = await applyTranslations(work.db, tdb, { onlyMissing: CONFIG.onlyMissing, titled: CONFIG.titled })
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
