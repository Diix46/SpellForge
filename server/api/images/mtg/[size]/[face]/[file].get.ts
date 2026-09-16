/**
 * Local Magic card images, with lazy back-fill.
 *
 * Serves the mirrored file when it exists. When it does not — `large` and `png`
 * are deliberately not pre-mirrored, and `small`/`normal` may still be
 * downloading — it fetches the image once from Scryfall's CDN, stores it, and
 * serves it. One route therefore implements the whole image policy: nothing is
 * requested from Scryfall twice.
 *
 * `*.scryfall.io` is explicitly exempt from Scryfall's rate limits, so a cold
 * back-fill is allowed; it is still one request per image, ever.
 *
 * SECURITY: this handler writes to disk based on URL input. Every segment is
 * checked against a strict allowlist or pattern before it touches a path or the
 * upstream URL — no traversal, no smuggled query string.
 */
import { Buffer } from 'node:buffer'
import { createReadStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import process from 'node:process'

const ROOT = resolve('.data/images/mtg')
const SIZES = new Set(['small', 'normal', 'large', 'png', 'art_crop'])
const FACES = new Set(['front', 'back'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const FILE = /^([0-9a-f-]{36})\.(jpg|png)$/
const VERSION = /^\d{1,12}$/
const UA = 'SpellForge/0.3.2 (+https://github.com/Diix46/SpellForge)'

export default defineEventHandler(async (event) => {
  const size = getRouterParam(event, 'size') ?? ''
  const face = getRouterParam(event, 'face') ?? ''
  const match = FILE.exec(getRouterParam(event, 'file') ?? '')

  if (!SIZES.has(size) || !FACES.has(face) || !match || !UUID.test(match[1]!))
    throw createError({ statusCode: 400, statusMessage: 'Bad image path' })

  const id = match[1]!
  const ext = match[2]!
  // Scryfall serves PNG only for the `png` size, JPEG for every other one.
  if ((size === 'png') !== (ext === 'png'))
    throw createError({ statusCode: 400, statusMessage: 'Bad image extension' })

  const path = resolve(ROOT, size, face, `${id}.${ext}`)
  // Defence in depth: the validation above already rules traversal out.
  if (!path.startsWith(ROOT + sep))
    throw createError({ statusCode: 400, statusMessage: 'Bad image path' })

  // Safe to cache forever: the URL carries the image version, so a re-scanned
  // image gets a new URL rather than a stale hit.
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'Content-Type', ext === 'png' ? 'image/png' : 'image/jpeg')

  if (existsSync(path) && statSync(path).size > 0)
    return sendStream(event, createReadStream(path))

  const rawVersion = getQuery(event).v
  const version = typeof rawVersion === 'string' && VERSION.test(rawVersion) ? rawVersion : ''
  const upstream = `https://cards.scryfall.io/${size}/${face}/${id[0]}/${id[1]}/${id}.${ext}${version ? `?${version}` : ''}`

  const res = await fetch(upstream, { headers: { 'User-Agent': UA } })
  if (!res.ok)
    throw createError({ statusCode: res.status === 404 ? 404 : 502, statusMessage: 'Image unavailable' })

  const bytes = Buffer.from(await res.arrayBuffer())
  // Write beside the target then rename: two concurrent requests for the same
  // missing image must never let a reader see a half-written file.
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, bytes)
  renameSync(tmp, path)

  // NOTE: a file on disk does not track the version. If Scryfall re-scans an
  // image, the local copy stays as it was until the mirror is re-run with
  // --force. Rare enough to accept for now.
  return bytes
})
