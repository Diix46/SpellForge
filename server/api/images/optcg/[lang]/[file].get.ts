/**
 * Local One Piece card images, with lazy back-fill.
 *
 * The mirror holds every French image and the English image of cards French
 * does not cover (scripts/mirror-images-optcg.mjs). An English page may still
 * ask for an English art of a card French does cover: that one is fetched once
 * from Bandai, stored beside the mirror, and served from disk ever after —
 * the same policy as the Magic image route.
 *
 * SECURITY: this handler writes to disk based on URL input. Both segments are
 * matched against strict patterns before they reach a path or a URL.
 */
import { Buffer } from 'node:buffer'
import { createReadStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import process from 'node:process'
import { OPTCG_ID } from '../../../../utils/cards/optcg-resolve'

const ROOT = resolve('.data/images/optcg')
const UA = 'SpellForge/0.3.2 (+https://github.com/Diix46/SpellForge)'
const VERSION = /^\d{1,12}$/

// Bandai serves WebP on the French site and PNG on the English one; the
// mirror falls back to the other format when a file is missing, so both are
// looked for on disk.
const HOSTS = {
  fr: { host: 'https://fr.onepiece-cardgame.com', formats: ['webp', 'png'] },
  en: { host: 'https://en.onepiece-cardgame.com', formats: ['png', 'webp'] },
} as const

const MIME = { webp: 'image/webp', png: 'image/png' } as const

export default defineEventHandler(async (event) => {
  const lang = getRouterParam(event, 'lang')
  const id = getRouterParam(event, 'file') ?? ''
  if ((lang !== 'fr' && lang !== 'en') || !OPTCG_ID.test(id))
    throw createError({ statusCode: 400, statusMessage: 'Bad image path' })

  const dir = resolve(ROOT, lang)
  // Cached forever, but only once found: the URL carries the image version, so
  // a regenerated image gets a new URL. A miss must stay retryable.
  const found = (format: keyof typeof MIME) => {
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    setHeader(event, 'Content-Type', MIME[format])
  }

  for (const format of HOSTS[lang].formats) {
    const path = resolve(dir, `${id}.${format}`)
    if (!path.startsWith(dir + sep))
      throw createError({ statusCode: 400, statusMessage: 'Bad image path' })
    if (existsSync(path) && statSync(path).size > 0) {
      found(format)
      return sendStream(event, createReadStream(path))
    }
  }

  const rawVersion = getQuery(event).v
  const version = typeof rawVersion === 'string' && VERSION.test(rawVersion) ? `?${rawVersion}` : ''
  for (const format of HOSTS[lang].formats) {
    const res = await fetch(`${HOSTS[lang].host}/images/cardlist/card/${id}.${format}${version}`, {
      headers: { 'User-Agent': UA },
      // A hung upstream must not hold the request open indefinitely.
      signal: AbortSignal.timeout(10_000),
    }).catch(() => { throw createError({ statusCode: 504, statusMessage: 'Image upstream timeout' }) })
    if (res.status === 404)
      continue
    if (!res.ok)
      throw createError({ statusCode: 502, statusMessage: 'Image unavailable' })

    const bytes = Buffer.from(await res.arrayBuffer())
    // Write beside the target then rename, so a concurrent reader never sees a
    // half-written file.
    const path = resolve(dir, `${id}.${format}`)
    mkdirSync(dir, { recursive: true })
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmp, bytes)
    renameSync(tmp, path)
    found(format)
    return bytes
  }
  throw createError({ statusCode: 404, statusMessage: 'Image unavailable' })
})
