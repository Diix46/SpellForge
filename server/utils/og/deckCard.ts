import type { Font } from 'opentype.js'
/**
 * A shared deck's link preview (Open Graph, 1200×630): the deck's key cards
 * fanned out on its world's ground, its name, its game and its size, signed
 * Prism. Composed with sharp; the text is drawn as paths from the fonts
 * shipped in server/assets/og-fonts (opentype.js): the server has no font of
 * its own, and sharp's text rendering depends on the system's.
 */
import type { GameId } from '../../../shared/game'
import type { TcgGameId } from '../../../shared/tcg/types'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { totalCards } from '../../../shared/decklist'
import { GAMES } from '../../../shared/game'
import { parseMtgDecklist } from '../../../shared/mtg/decklist'
import { parseOptcgDecklist } from '../../../shared/optcg/decklist'
import { parseTcgDecklist } from '../../../shared/tcg/deck'
import { TCG_RULES } from '../../../shared/tcg/rules'
import { isTcgGame } from '../../../shared/tcg/types'
import { useMtgCardsDb, useOptcgCardsDb } from '../cards/db'
import { resolveEntries } from '../cards/mtg-resolve'
import { buildOptcgByNumberQuery } from '../cards/optcg-query'
import { toOptcgCard } from '../cards/optcg-shape'
import { loadSharp } from '../images/thumbnail'
import { useTcgDb } from '../tcg/db'
import { buildByIdQuery, toTcgCard } from '../tcg/query'

export const OG_W = 1200
export const OG_H = 630
const FAN = 5
const FONTS = resolve('server/assets/og-fonts')

/** Each world's ground and ink on the preview. */
const GROUND: Record<GameId, { from: string, to: string, ink: string, accent: string }> = {
  optcg: { from: '#f4e4c3', to: '#d9bd86', ink: '#231708', accent: '#c9312a' },
  mtg: { from: '#1d2530', to: '#0b0e12', ink: '#eef0f1', accent: '#7aa0d4' },
  pokemon: { from: '#fff3c4', to: '#f4c542', ink: '#1b1d2a', accent: '#d6342e' },
  yugioh: { from: '#1b2f6b', to: '#070b1a', ink: '#eef1fb', accent: '#d4af37' },
  riftbound: { from: '#0a323c', to: '#010a13', ink: '#f0e6d2', accent: '#c8aa6e' },
}

interface MtgImageRow { image_uris?: { normal?: string }, card_faces?: { image_uris?: { normal?: string } }[] }

/** The deck's key cards (commander or Leader first), as the app serves their images. */
export async function keyCardImages(game: GameId, raw: string, lang: 'fr' | 'en'): Promise<{ images: string[], count: number }> {
  if (game === 'mtg') {
    const parsed = parseMtgDecklist(raw)
    const commanders = new Set((parsed.commanders ?? []).map(n => n.toLowerCase()))
    const entries = [...parsed.mainboard].sort((a, b) => Number(commanders.has(b.name.toLowerCase())) - Number(commanders.has(a.name.toLowerCase()))).slice(0, FAN)
    const rows = await resolveEntries(useMtgCardsDb(), entries.map(e => ({ name: e.name, set: e.set, collectorNumber: e.collectorNumber })), lang)
    const images = rows.map(r => r.card as unknown as MtgImageRow | null).map(c => c?.image_uris?.normal ?? c?.card_faces?.[0]?.image_uris?.normal ?? null)
    return { images: images.filter((i): i is string => !!i), count: totalCards(parsed.mainboard) }
  }
  if (game === 'optcg') {
    const parsed = parseOptcgDecklist(raw)
    const numbers = parsed.mainboard.map(e => e.name).slice(0, 12)
    const { rows } = await useOptcgCardsDb().execute(buildOptcgByNumberQuery(numbers, lang))
    const cards = rows.map(toOptcgCard)
    // The Leader first, then the deck in its order.
    const ordered = [...cards].sort((a, b) => Number(b.category === 'Leader') - Number(a.category === 'Leader') || numbers.indexOf(a.number) - numbers.indexOf(b.number))
    return { images: ordered.slice(0, FAN).map(c => c.image).filter(Boolean), count: totalCards(parsed.mainboard) }
  }
  if (isTcgGame(game)) {
    const parsed = parseTcgDecklist(raw, TCG_RULES[game as TcgGameId].zones)
    const ids = parsed.mainboard.map(e => e.name).slice(0, FAN * 2)
    const { rows } = ids.length ? await useTcgDb(game).execute(buildByIdQuery(ids, lang)) : { rows: [] }
    const byId = new Map(rows.map(r => toTcgCard(game, r)).map(c => [c.id, c]))
    const images = ids.map(id => byId.get(id)?.image).filter((i): i is string => !!i).slice(0, FAN)
    return { images, count: totalCards(parsed.mainboard) }
  }
  return { images: [], count: 0 }
}

let fonts: { display: Font, text: Font } | null = null
function loadFonts() {
  const read = (file: string) => {
    const b = readFileSync(resolve(FONTS, file))
    return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
  }
  fonts ??= { display: read('Anton-Regular.ttf'), text: read('Inter.ttf') }
  return fonts
}

/**
 * Glyph by glyph, from the character map alone: opentype.js's text shaping
 * stops on some of Inter's substitution tables, and a title needs none.
 */
function advance(font: Font, text: string, size: number, tracking = 0): number {
  let w = 0
  for (const ch of text)
    w += (font.charToGlyph(ch).advanceWidth ?? 0) * size / font.unitsPerEm + tracking * size
  return w
}

/** Lines of `text` in `font` at `size`, wrapped at `width`. */
function wrap(font: Font, text: string, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (line && advance(font, next, size) > width) {
      lines.push(line)
      line = word
    }
    else {
      line = next
    }
  }
  if (line)
    lines.push(line)
  return lines
}

/** SVG path of a line of text, its letters spaced by `tracking` (em). */
function textPath(font: Font, text: string, x: number, baseline: number, size: number, fill: string, tracking = 0): string {
  let cx = x
  const parts: string[] = []
  for (const ch of text) {
    const glyph = font.charToGlyph(ch)
    parts.push(glyph.getPath(cx, baseline, size).toPathData(2))
    cx += (glyph.advanceWidth ?? 0) * size / font.unitsPerEm + tracking * size
  }
  return `<path d="${parts.join(' ')}" fill="${fill}"/>`
}

/** The preview's PNG; `fetchImage` reads an app image path (so the image cache is shared). */
export async function renderDeckCard(opts: {
  game: GameId
  name: string
  count: number
  images: string[]
  countLabel: string
  fetchImage: (path: string) => Promise<Buffer | null>
}): Promise<Buffer | null> {
  const sharp = await loadSharp()
  if (!sharp)
    return null
  const g = GROUND[opts.game]
  const ground = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g.from}"/><stop offset="1" stop-color="${g.to}"/></linearGradient>
      <radialGradient id="glow" cx="0.78" cy="0.5" r="0.6"><stop offset="0" stop-color="${g.accent}" stop-opacity="0.35"/><stop offset="1" stop-color="${g.accent}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect width="100%" height="100%" fill="url(#glow)"/>
    <rect x="0" y="0" width="${OG_W}" height="8" fill="${GAMES[opts.game].swatch}"/>
  </svg>`)

  // The cards, fanned out on the right.
  const CW = 250
  const CH = Math.round(CW * 88 / 63)
  const cards = (await Promise.all(opts.images.map(async (src, i) => {
    const bytes = await opts.fetchImage(src).catch(() => null)
    if (!bytes)
      return null
    const n = opts.images.length
    const spread = (i - (n - 1) / 2)
    const angle = spread * 7
    const mask = Buffer.from(`<svg width="${CW}" height="${CH}"><rect width="${CW}" height="${CH}" rx="12" ry="12"/></svg>`)
    // An image that can't be read leaves its place empty, not the preview broken.
    const card = await sharp(bytes).resize(CW, CH, { fit: 'cover' }).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer().catch(() => null)
    if (!card)
      return null
    const turned = await sharp(card).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true })
    const cx = 880 + spread * 88
    const cy = 330 + Math.abs(spread) * 18
    return { input: turned.data, left: Math.round(cx - turned.info.width / 2), top: Math.round(cy - turned.info.height / 2) }
  }))).filter(c => c != null)

  // The words on the left: the game, the deck's name (up to three lines,
  // smaller when long), its size; Prism at the foot.
  const f = loadFonts()
  let size = 84
  // Left of the fan: the words keep to their column.
  const COL = 420
  let lines = wrap(f.display, opts.name.toUpperCase(), size, COL)
  while ((lines.length > 2 || lines.some(l => advance(f.display, l, size) > COL)) && size > 44) {
    size -= 6
    lines = wrap(f.display, opts.name.toUpperCase(), size, COL)
  }
  lines = lines.slice(0, 3)
  const lead = size * 1.05
  const top = Math.round(OG_H / 2 - (lines.length * lead) / 2)
  const words = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}">
    ${textPath(f.display, GAMES[opts.game].label.toUpperCase(), 72, top - 26, 28, g.accent, 0.14)}
    ${lines.map((l, k) => textPath(f.display, l.toUpperCase(), 72, top + lead * (k + 1) - size * 0.12, size, g.ink)).join('')}
    ${textPath(f.text, opts.countLabel, 72, top + lead * lines.length + 46, 28, g.ink)}
    ${textPath(f.display, 'PRISM', 72, OG_H - 56, 26, g.ink, 0.3)}
  </svg>`)

  return sharp(ground)
    .composite([...cards, { input: words, left: 0, top: 0 }])
    .png({ compressionLevel: 8 })
    .toBuffer()
}
