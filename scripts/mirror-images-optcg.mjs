#!/usr/bin/env node
/**
 * One Piece image mirror — Bandai CDN → local disk.
 *
 * Unlike Scryfall, Bandai offers no caching permission, no rate-limit promise
 * and no stable URLs: the `?<version>` cache-buster changes on every dataset
 * regeneration, so a hotlinked image can 404 without warning. Mirroring is the
 * conservative choice here, not the extravagant one.
 *
 * Scope: every image in both languages. French covers only ~63% of card
 * numbers (Bandai is 23 packs behind), and the English site shows English art
 * for the cards French does cover too. Mirroring English only for the cards
 * without French left the English pages to fetch from Bandai at runtime, which
 * the plan rules out (no runtime dependency, no caching permission).
 *
 * Resumable: a file already on disk at the right version is skipped, so an
 * interrupted run costs nothing to restart.
 *
 * Usage:  node scripts/mirror-images-optcg.mjs [--force] [--limit N]
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DB = process.env.OPTCG_CARDS_DB ? resolve(process.env.OPTCG_CARDS_DB) : resolve(ROOT, '.data/cards-optcg.db')
const OUT = resolve(ROOT, '.data/images/optcg')

// Bandai serves a different format per locale: WebP on the French site, PNG on
// the English one. We store only the version marker in the database, so the
// extension is a per-locale constant — with a fallback probe if it ever changes.
const HOSTS = {
  fr: { host: 'https://fr.onepiece-cardgame.com', ext: 'webp', alt: 'png' },
  en: { host: 'https://en.onepiece-cardgame.com', ext: 'png', alt: 'webp' },
}

const UA = 'Prism/0.3.2 (+https://github.com/Diix46/SpellForge)'
const CONCURRENCY = 4
const PAUSE_MS = 60

const force = process.argv.includes('--force')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity

const log = (...a) => console.log(...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const mb = n => `${(n / 1048576).toFixed(1)} Mo`

function urlFor(lang, id, version, ext) {
  const v = version ? `?${version}` : ''
  return `${HOSTS[lang].host}/images/cardlist/card/${id}.${ext}${v}`
}

async function download(lang, id, version) {
  const cfg = HOSTS[lang]
  const dir = resolve(OUT, lang)
  for (const ext of [cfg.ext, cfg.alt]) {
    const dest = resolve(dir, `${id}.${ext}`)
    if (!force && existsSync(dest) && statSync(dest).size > 0)
      return { skipped: true, bytes: statSync(dest).size }

    const res = await fetch(urlFor(lang, id, version, ext), { headers: { 'User-Agent': UA } })
    if (res.status === 404)
      continue // wrong extension for this locale — try the other
    if (!res.ok)
      return { failed: `HTTP ${res.status}` }

    mkdirSync(dir, { recursive: true })
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
    return { bytes: statSync(dest).size }
  }
  return { missing: true }
}

async function main() {
  if (!existsSync(DB)) {
    console.error('✖ base One Piece absente — lancez d\'abord `npm run cards:ingest:op`')
    process.exitCode = 1
    return
  }

  const db = createClient({ url: `file:${DB}` })
  const rows = async sql => (await db.execute(sql)).rows

  const fr = await rows(`SELECT id, img_version FROM op_cards WHERE lang='fr'`)
  const en = await rows(`SELECT id, img_version FROM op_cards WHERE lang='en'`)
  db.close()

  const jobs = [
    ...fr.map(r => ({ lang: 'fr', id: r.id, version: r.img_version })),
    ...en.map(r => ({ lang: 'en', id: r.id, version: r.img_version })),
  ].slice(0, LIMIT)

  log(`\nMiroir d'images One Piece\n`)
  log(`  ${fr.length} visuels FR + ${en.length} visuels EN = ${jobs.length} à traiter`)
  log(`  destination : ${OUT.replace(`${ROOT}/`, '')}\n`)

  let done = 0
  let skipped = 0
  const missing = []
  let bytes = 0
  const failures = []
  const t0 = Date.now()
  let i = 0

  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < jobs.length) {
      const job = jobs[i++]
      // Only a request to Bandai earns the polite pause, not a file on disk.
      let requested = true
      try {
        const r = await download(job.lang, job.id, job.version)
        if (r.missing) {
          missing.push(`${job.lang}/${job.id}`)
        }
        else if (r.failed) {
          failures.push(`${job.lang}/${job.id}: ${r.failed}`)
        }
        else {
          bytes += r.bytes || 0
          requested = !r.skipped
          if (r.skipped)
            skipped++
          else
            done++
        }
      }
      catch (e) {
        failures.push(`${job.lang}/${job.id}: ${e.message}`)
      }
      const seen = done + skipped + missing.length + failures.length
      if (seen % 200 === 0)
        process.stdout.write(`\r  ${seen} / ${jobs.length}`)
      if (!PAUSE_MS || !requested)
        continue
      await sleep(PAUSE_MS)
    }
  }))

  process.stdout.write(`\r${' '.padEnd(60)}\r`)
  log(`  ✔ ${done} téléchargés · ${skipped} déjà présents · ${missing.length} absents chez Bandai · ${failures.length} en échec`)
  // Absent upstream (404 on both formats): nothing a retry can fix, so it is
  // reported but does not fail the run.
  if (missing.length)
    log(`    absents : ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`)
  log(`    ${mb(bytes)} au total · ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  if (failures.length) {
    log(`\n  Échecs (${Math.min(failures.length, 10)} premiers) :`)
    for (const f of failures.slice(0, 10)) log(`    ${f}`)
    // A partial mirror: a second run fetches only what is missing, which is
    // what the scheduled refresh does on this code.
    process.exitCode = 2
  }

  for (const lang of Object.keys(HOSTS)) {
    const dir = resolve(OUT, lang)
    if (existsSync(dir))
      log(`    ${lang} : ${readdirSync(dir).length} fichiers`)
  }
  log()
}

main().catch((e) => {
  console.error('\n✖ miroir échoué :', e.message)
  process.exitCode = 1
})
