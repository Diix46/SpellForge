/**
 * Light copies of card images: 320 px wide WebP, the width the grids and the
 * landing's card tide draw at. The One Piece mirror makes them ahead of time;
 * Magic ones are made here on first request and kept beside the mirror.
 *
 * sharp is loaded lazily and is optional: without it, callers serve the
 * full image instead.
 */
import type { Buffer } from 'node:buffer'
import type SharpModule from 'sharp'
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import process from 'node:process'

export const THUMB_WIDTH = 320

type Sharp = typeof SharpModule
let loading: Promise<Sharp | null> | null = null

export function loadSharp(): Promise<Sharp | null> {
  loading ??= import('sharp').then(m => m.default).catch(() => null)
  return loading
}

export function hasFile(path: string): boolean {
  return existsSync(path) && statSync(path).size > 0
}

/**
 * Makes the light copy of `source` at `target` and returns its bytes, or null
 * when it cannot be made (no sharp, unreadable source).
 */
export async function makeThumbnail(source: string, target: string): Promise<Buffer | null> {
  const sharp = await loadSharp()
  if (!sharp)
    return null
  try {
    const bytes = await sharp(source)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer()
    // Written beside the target then renamed, so a reader never sees half a file.
    mkdirSync(dirname(target), { recursive: true })
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmp, bytes)
    renameSync(tmp, target)
    return bytes
  }
  catch {
    return null
  }
}
