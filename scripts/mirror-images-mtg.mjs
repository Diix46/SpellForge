#!/usr/bin/env node
/**
 * Magic image mirror — Scryfall CDN → local disk.
 *
 * Scryfall is the opposite case from Bandai: the docs *encourage* caching, and
 * the `*.scryfall.io` file origins are explicitly exempt from rate limits. We
 * still keep concurrency civil — being allowed to hammer someone is not a
 * reason to.
 *
 * Scope: only the printings the app can actually display, i.e. the ones
 * `best_printings` resolved for each served language. That is roughly a third
 * of the 174 228 rows in `printings` — mirroring every printing would multiply
 * the cost for images no user can reach.
 *
 * Sizes: `small` (grid thumbnails) and `normal` (detail view). Deliberately NOT
 * `large`/`png`: those exist for the PDF proxy export, which is an occasional
 * deliberate action rather than a browse path, and at ~1 MB per PNG a full
 * mirror of them would dwarf everything else. The image route
 * (server/api/images/mtg) fetches each of them once, on first request, and
 * serves it from disk afterwards.
 *
 * URLs are rebuilt, never stored: Scryfall's pattern is
 *   https://cards.scryfall.io/{size}/{face}/{id[0]}/{id[1]}/{id}.jpg?{version}
 * so the database keeps `id` + `img_version` and nothing else. Storing all
 * eleven variants per printing cost ~400 MB, 62 % of the database.
 *
 * Resumable: an existing non-empty file is skipped, so an interrupted run costs
 * nothing to restart.
 *
 * Usage:  node scripts/mirror-images-mtg.mjs [--force] [--limit N] [--sizes small,normal]
 */
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DB = resolve(ROOT, '.data/cards-mtg.db')
const OUT = resolve(ROOT, '.data/images/mtg')

const UA = 'Prism/0.3.2 (+https://github.com/Diix46/SpellForge)'
const CONCURRENCY = 8
const PAUSE_MS = 25

const argv = process.argv
const force = argv.includes('--force')
function arg(name, fallback) {
  const i = argv.indexOf(name)
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback
}
const LIMIT = Number(arg('--limit', Infinity))
const SIZES = String(arg('--sizes', 'small,normal')).split(',').map(s => s.trim()).filter(Boolean)

const log = (...a) => console.log(...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const gb = n => (n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} Go` : `${(n / 1048576).toFixed(1)} Mo`)

function urlFor(size, face, id, version) {
  return `https://cards.scryfall.io/${size}/${face}/${id[0]}/${id[1]}/${id}.jpg${version ? `?${version}` : ''}`
}

async function download(size, face, id, version) {
  const dir = resolve(OUT, size, face)
  const dest = resolve(dir, `${id}.jpg`)
  if (!force && existsSync(dest) && statSync(dest).size > 0)
    return { skipped: true, bytes: statSync(dest).size }

  const res = await fetch(urlFor(size, face, id, version), { headers: { 'User-Agent': UA } })
  // A back face that does not exist is a normal 404, not a failure.
  if (res.status === 404)
    return { missing: true }
  if (!res.ok)
    return { failed: `HTTP ${res.status}` }

  mkdirSync(dir, { recursive: true })
  // Written aside then renamed: a cut transfer never leaves a file that looks
  // complete (the next run would skip it).
  const part = `${dest}.part`
  await pipeline(Readable.fromWeb(res.body), createWriteStream(part))
  renameSync(part, dest)
  return { bytes: statSync(dest).size }
}

async function main() {
  if (!existsSync(DB)) {
    console.error('✖ base Magic absente — lancez d\'abord `npm run cards:ingest`')
    process.exitCode = 1
    return
  }

  const db = createClient({ url: `file:${DB}` })
  // Distinct printings across every served language: the same printing often
  // answers for both fr and en, so a DISTINCT here avoids downloading it twice.
  const printings = (await db.execute(`
    SELECT DISTINCT p.id, p.img_version
      FROM best_printings b
      JOIN printings p ON p.id = b.printing_id
     WHERE p.is_real_image = 1`)).rows

  // Double-faced cards carry a second image under /back/.
  const backs = (await db.execute(`
    SELECT DISTINCT f.printing_id AS id, f.img_version
      FROM card_faces f
      JOIN best_printings b ON b.printing_id = f.printing_id
     WHERE f.face_index = 1 AND f.img_version IS NOT NULL`)).rows
  db.close()

  const jobs = []
  for (const size of SIZES) {
    for (const r of printings) jobs.push({ size, face: 'front', id: String(r.id), version: r.img_version })
    for (const r of backs) jobs.push({ size, face: 'back', id: String(r.id), version: r.img_version })
  }
  const slice = jobs.slice(0, LIMIT)

  log('\nMiroir d\'images Magic\n')
  log(`  ${printings.length.toLocaleString('fr-FR')} impressions affichables (+ ${backs.length} versos)`)
  log(`  tailles : ${SIZES.join(', ')} → ${slice.length.toLocaleString('fr-FR')} fichiers`)
  log(`  destination : ${OUT.replace(`${ROOT}/`, '')}\n`)

  let done = 0
  let skipped = 0
  let missing = 0
  let bytes = 0
  const failures = []
  const t0 = Date.now()
  let i = 0

  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < slice.length) {
      const job = slice[i++]
      try {
        const r = await download(job.size, job.face, job.id, job.version)
        if (r.failed) {
          failures.push(`${job.size}/${job.face}/${job.id}: ${r.failed}`)
        }
        else if (r.missing) {
          missing++
        }
        else {
          bytes += r.bytes || 0
          if (r.skipped)
            skipped++
          else
            done++
        }
      }
      catch (e) {
        failures.push(`${job.size}/${job.face}/${job.id}: ${e.message}`)
      }
      const n = done + skipped + missing + failures.length
      if (n % 500 === 0) {
        const rate = n / ((Date.now() - t0) / 1000)
        const eta = Math.round((slice.length - n) / Math.max(rate, 0.1) / 60)
        process.stdout.write(`\r  ${n.toLocaleString('fr-FR')} / ${slice.length.toLocaleString('fr-FR')} · ${gb(bytes)} · ~${eta} min restantes   `)
      }
      if (PAUSE_MS)
        await sleep(PAUSE_MS)
    }
  }))

  process.stdout.write(`\r${' '.padEnd(78)}\r`)
  log(`  ✔ ${done.toLocaleString('fr-FR')} téléchargés · ${skipped.toLocaleString('fr-FR')} déjà présents · ${missing} absents · ${failures.length} en échec`)
  log(`    ${gb(bytes)} · ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`)
  if (failures.length) {
    log(`\n  Échecs (${Math.min(failures.length, 10)} premiers) :`)
    for (const f of failures.slice(0, 10)) log(`    ${f}`)
  }
  log()
}

main().catch((e) => {
  console.error('\n✖ miroir échoué :', e.message)
  process.exitCode = 1
})
