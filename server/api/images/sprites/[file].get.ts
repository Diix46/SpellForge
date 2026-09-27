/**
 * Pokémon's animated sprites (the Black & White games', from the PokéAPI
 * sprites collection), for the Pokémon backdrop: fetched once from their one
 * fixed origin, kept on disk, served forever.
 *
 * SECURITY: a national dex number and nothing else reaches the path or the
 * upstream URL.
 */
import { Buffer } from 'node:buffer'
import { createReadStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const ORIGIN = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/'
const ROOT = resolve('.data/images/sprites')

export default defineEventHandler(async (event) => {
  const m = /^(\d{1,3})\.gif$/.exec(getRouterParam(event, 'file') ?? '')
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 649)
    throw createError({ statusCode: 400, statusMessage: 'Bad sprite' })
  const file = resolve(ROOT, `${Number(m[1])}.gif`)
  if (!existsSync(file) || statSync(file).size === 0) {
    const res = await fetch(`${ORIGIN}${Number(m[1])}.gif`).catch(() => null)
    if (!res?.ok)
      throw createError({ statusCode: 404, statusMessage: 'Sprite not found' })
    mkdirSync(ROOT, { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, Buffer.from(await res.arrayBuffer()))
    renameSync(tmp, file)
  }
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'Content-Type', 'image/gif')
  return sendStream(event, createReadStream(file))
})
