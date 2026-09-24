/**
 * Recomposed French cards: a sharp French card made from the English HD scan
 * of the same printing (scripts/recompose), for the French printings Scryfall
 * only has as low-resolution scans.
 *
 * One 745x1040 JPEG per French printing id sits in RECOMPOSED_DIR; the other
 * sizes and the 320 px WebP are derived on first request and kept beside it.
 * Cards point at them with an `r` query parameter, so their browser cache
 * stays apart from the official scan's.
 *
 * Scryfall's scan stays the default: a card shows its recomposed version only
 * when its deck line asks for it ("[HD]"), and says it has one otherwise
 * (`recomposable`), so the player can ask.
 */
import type { Buffer } from 'node:buffer'
import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { hasFile, loadSharp, THUMB_WIDTH } from './thumbnail'

export const RECOMPOSED_DIR = resolve('.data/images/mtg/recomposed')
/** Bump when the images are regenerated: a new `r` is a new cached URL. */
export const RECOMPOSED_VERSION = '1'

// Sizes the image route derives, as Scryfall sizes them.
const DERIVED: Record<string, [number, number] | null> = {
  png: null, // the master itself
  large: [672, 936],
  normal: [488, 680],
  small: [146, 204],
}

// The ids on disk, read again every few minutes: images are added while the
// server runs, and a directory listing per request would be wasteful.
const TTL_MS = 5 * 60_000
let known: { at: number, ids: Set<string> } | null = null

export function recomposedIds(): Set<string> {
  if (known && Date.now() - known.at < TTL_MS)
    return known.ids
  let ids = new Set<string>()
  try {
    ids = new Set(readdirSync(RECOMPOSED_DIR).filter(f => f.endsWith('.jpg')).map(f => f.slice(0, -4)))
  }
  catch {}
  known = { at: Date.now(), ids }
  return ids
}

export function isRecomposed(id: string): boolean {
  return recomposedIds().has(id)
}

/**
 * The recomposed image of `id` at `size` (or its 320 px WebP), made on first
 * request. Null when there is none for that size, or it cannot be made.
 */
export async function recomposedImage(id: string, size: string, thumb: boolean): Promise<{ path?: string, bytes?: Buffer, type: string } | null> {
  if (!(size in DERIVED) || !isRecomposed(id))
    return null
  const master = resolve(RECOMPOSED_DIR, `${id}.jpg`)
  if (!hasFile(master))
    return null
  const dims = thumb ? [THUMB_WIDTH, 0] as const : DERIVED[size]
  if (!dims)
    return { path: master, type: 'image/jpeg' }
  const target = thumb ? resolve(RECOMPOSED_DIR, 'thumb', `${id}.webp`) : resolve(RECOMPOSED_DIR, size, `${id}.jpg`)
  const type = thumb ? 'image/webp' : 'image/jpeg'
  if (hasFile(target))
    return { path: target, type }
  const sharp = await loadSharp()
  if (!sharp)
    return { path: master, type: 'image/jpeg' }
  try {
    const pipeline = sharp(master).resize({ width: dims[0], height: dims[1] || undefined, fit: 'fill' })
    const bytes = thumb ? await pipeline.webp({ quality: 72 }).toBuffer() : await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer()
    // Written beside the target then renamed, so a reader never sees half a file.
    mkdirSync(dirname(target), { recursive: true })
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmp, bytes)
    renameSync(tmp, target)
    return { bytes, type }
  }
  catch {
    return null
  }
}
