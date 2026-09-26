/**
 * Magic set symbols, mirrored: fetched once from Scryfall's SVG host, kept
 * under .data/images/mtg/sets, served from there. Served by us rather than
 * linked, so the page can use them as CSS masks (the rarity colours the
 * symbol) — Scryfall's host sends no CORS header — and never depends on it.
 *
 * SECURITY: the code is checked against a strict pattern before it touches a
 * path or the upstream URL.
 */
import { Buffer } from 'node:buffer'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { hasFile } from '../../../utils/images/thumbnail'

const ROOT = resolve('.data/images/mtg/sets')
const FILE = /^([a-z0-9]{2,8})\.svg$/
const UA = 'Prism/0.3.2 (+https://github.com/Diix46/SpellForge)'

export default defineEventHandler(async (event) => {
  const match = FILE.exec(getRouterParam(event, 'file') ?? '')
  if (!match)
    throw createError({ statusCode: 400, statusMessage: 'Bad set code' })
  const code = match[1]!
  const path = resolve(ROOT, `${code}.svg`)
  let svg: Buffer
  if (hasFile(path)) {
    svg = readFileSync(path)
  }
  else {
    const res = await fetch(`https://svgs.scryfall.io/sets/${code}.svg`, { headers: { 'User-Agent': UA, 'Accept': 'image/svg+xml' } })
    if (!res.ok)
      throw createError({ statusCode: res.status === 404 ? 404 : 502, statusMessage: 'No set symbol' })
    svg = Buffer.from(await res.arrayBuffer())
    mkdirSync(ROOT, { recursive: true })
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmp, svg)
    renameSync(tmp, path)
  }
  setHeader(event, 'Content-Type', 'image/svg+xml')
  setHeader(event, 'Cache-Control', 'public, max-age=2592000')
  return svg
})
