/**
 * Pokémon's 3D renders (the Pokémon HOME models, from the PokéAPI sprites
 * collection), for the Pokémon backdrop: fetched once from their one fixed
 * origin, shrunk to a light WebP kept on disk, served forever.
 *
 * SECURITY: a national dex number and nothing else reaches the path or the
 * upstream URL.
 */
import { Buffer } from 'node:buffer'
import { createReadStream, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { hasFile, makeThumbnail } from '~~/server/utils/images/thumbnail'

const ORIGIN = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/'
const ROOT = resolve('.data/images/sprites')
/** Twice the size the meadow draws them at. */
const WIDTH = 240

export default defineEventHandler(async (event) => {
  const m = /^(\d{1,4})\.webp$/.exec(getRouterParam(event, 'file') ?? '')
  const dex = Number(m?.[1])
  if (!m || dex < 1 || dex > 1025)
    throw createError({ statusCode: 400, statusMessage: 'Bad sprite' })
  const file = resolve(ROOT, `home-${dex}.webp`)
  if (!hasFile(file)) {
    const res = await fetch(`${ORIGIN}${dex}.png`).catch(() => null)
    if (!res?.ok)
      throw createError({ statusCode: 404, statusMessage: 'Sprite not found' })
    mkdirSync(ROOT, { recursive: true })
    const png = resolve(ROOT, `home-${dex}.${process.pid}.png`)
    writeFileSync(png, Buffer.from(await res.arrayBuffer()))
    // Without sharp, the full render is kept as it is.
    if (await makeThumbnail(png, file, WIDTH))
      unlinkSync(png)
    else
      renameSync(png, file)
  }
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'Content-Type', 'image/webp')
  return sendStream(event, createReadStream(file))
})
