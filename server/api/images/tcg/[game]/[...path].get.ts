import { Buffer } from 'node:buffer'
/**
 * The generic engine's card images, from a disk cache filled on first view.
 *
 * Each game's image host is fixed (utils/tcg/query IMAGE_ORIGIN): the path
 * after it is all the client names, so this can only ever fetch from there.
 * A fetched image is kept for good — its URL names one printing's scan.
 *
 * SECURITY: the path is matched against a strict pattern (no "..", a known
 * image extension) before it reaches the disk or the upstream URL.
 */
import { createReadStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import process from 'node:process'
import { hasFile, makeThumbnail } from '../../../../utils/images/thumbnail'
import { tcgGame } from '../../../../utils/tcg/params'
import { IMAGE_ORIGIN } from '../../../../utils/tcg/query'

const ROOT = resolve('.data/images/tcg')
const PATH = /^(?:[\w\-]+(?:\.[\w\-]+)*\/){0,6}[\w\-]+\.(webp|png|jpg)$/
const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' } as const
// Twice the same image asked at once (a grid, then its sheet): one download.
const inflight = new Map<string, Promise<boolean>>()

async function download(url: string, file: string): Promise<boolean> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Prism/0.3.2 (+https://github.com/Diix46/SpellForge)' } }).catch(() => null)
  if (!res?.ok || !res.headers.get('content-type')?.startsWith('image/'))
    return false
  const body = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, body)
  renameSync(tmp, file)
  return true
}

export default defineEventHandler(async (event) => {
  const game = tcgGame(event)
  const path = getRouterParam(event, 'path') ?? ''
  const m = PATH.exec(path)
  if (!m)
    throw createError({ statusCode: 400, statusMessage: 'Bad image path' })
  const dir = resolve(ROOT, game)
  const file = resolve(dir, path)
  // Defence in depth: the pattern already rules traversal out.
  if (!file.startsWith(dir + sep))
    throw createError({ statusCode: 400, statusMessage: 'Bad image path' })

  if (!existsSync(file) || statSync(file).size === 0) {
    let pending = inflight.get(file)
    if (!pending) {
      pending = download(IMAGE_ORIGIN[game] + path, file).finally(() => inflight.delete(file))
      inflight.set(file, pending)
    }
    if (!await pending)
      throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  // ?size=thumb (320 px) or medium (640 px, the 3D rooms' wall art): a WebP
  // made once beside the cache, for a source that publishes only full-size
  // scans (Riftbound). Without sharp, the image itself.
  const size = getQuery(event).size
  if (size === 'thumb' || size === 'medium') {
    const thumb = resolve(ROOT, game, size, `${path}.webp`)
    const bytes = hasFile(thumb) ? null : await makeThumbnail(file, thumb, size === 'medium' ? 640 : undefined)
    if (bytes || hasFile(thumb)) {
      setHeader(event, 'Content-Type', 'image/webp')
      return bytes ?? sendStream(event, createReadStream(thumb))
    }
  }
  setHeader(event, 'Content-Type', MIME[m[1] as keyof typeof MIME])
  return sendStream(event, createReadStream(file))
})
