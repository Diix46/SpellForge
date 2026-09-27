/**
 * League of Legends splash art (Riot's Data Dragon), for Riftbound's
 * backdrops and its 3D hall: fetched once from its one fixed origin, kept on
 * disk, served forever.
 *
 * SECURITY: a champion id and a skin number ("Jinx_37.jpg") and nothing else
 * reach the path or the upstream URL.
 */
import { Buffer } from 'node:buffer'
import { createReadStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const ORIGIN = 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/'
const ROOT = resolve('.data/images/lol')

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'file') ?? ''
  if (!/^[A-Z][A-Za-z]{1,20}_\d{1,3}\.jpg$/.test(name))
    throw createError({ statusCode: 400, statusMessage: 'Bad splash' })
  const file = resolve(ROOT, name)
  if (!existsSync(file) || statSync(file).size === 0) {
    const res = await fetch(`${ORIGIN}${name}`).catch(() => null)
    if (!res?.ok)
      throw createError({ statusCode: 404, statusMessage: 'Splash not found' })
    mkdirSync(ROOT, { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, Buffer.from(await res.arrayBuffer()))
    renameSync(tmp, file)
  }
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'Content-Type', 'image/jpeg')
  return sendStream(event, createReadStream(file))
})
