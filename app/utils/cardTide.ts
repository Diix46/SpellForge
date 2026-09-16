/**
 * The landing's card tide, without the DOM: which card goes where, how big the
 * cards are, where a showcased card lands. The component (CardTide.vue) owns
 * the motion; everything here is pure so it can be tested.
 */
import type { LandingCard, LandingPoster } from '#shared/landing'
import type { OptcgColor } from '#shared/optcg/rules'
import { cardPath } from '#shared/game'
import { OPTCG_COLOR_HEX } from './optcgColors'

/** One Piece fills the left of the tide, Magic the right. */
export type TideSide = 'op' | 'mtg'

export interface TideCard {
  side: TideSide
  name: string
  /** Card number (One Piece) or artist (Magic). */
  detail: string
  /** Drawn in the pile. */
  image: string
  /** Drawn once the card is showcased and larger. */
  full: string
  /** `r, g, b` of the card's first colour. */
  accent: string
  /** CSS colours of the card's colours, in order. */
  pips: string[]
  path: string
}

// Brand mana colours, as the old hero painted them.
const MANA_RGB: Readonly<Record<string, string>> = {
  w: '233, 205, 120',
  u: '79, 168, 232',
  b: '150, 120, 200',
  r: '232, 88, 68',
  g: '56, 184, 131',
}
const MAGIC_GOLD = '212, 175, 95'
const OP_SAND = '233, 167, 44'

function hexTriplet(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

export function tideFromMagic(card: LandingCard): TideCard {
  const colors = card.colors.filter(c => MANA_RGB[c])
  return {
    side: 'mtg',
    name: card.name,
    detail: card.artist,
    image: card.thumb || card.image,
    full: card.image,
    accent: colors.length ? MANA_RGB[colors[0]!]! : MAGIC_GOLD,
    pips: colors.map(c => `rgb(${MANA_RGB[c]})`),
    path: card.path,
  }
}

export function tideFromPoster(card: LandingPoster): TideCard {
  const colors = card.colors.filter((c): c is OptcgColor => c in OPTCG_COLOR_HEX)
  return {
    side: 'op',
    name: card.name,
    detail: card.number,
    image: card.thumb || card.image,
    full: card.image,
    accent: colors.length ? hexTriplet(OPTCG_COLOR_HEX[colors[0]!]) : OP_SAND,
    pips: colors.map(c => OPTCG_COLOR_HEX[c]),
    path: cardPath('optcg', card.number),
  }
}

// ---------------------------------------------------------------- grid

export interface TideGrid {
  cols: number
  rows: number
  /** Card width and height, px. */
  cw: number
  ch: number
  count: number
}

/** Cell pitch as a share of the card: lower means more overlap. */
export const TIDE_OVERLAP = 0.52
/** The grid runs past each edge so cards bleed off the frame. */
export const TIDE_OVERSCAN = 1.18
/** Card height over width (both games print on the same format). */
export const CARD_RATIO = 1.4

/**
 * A grid that always covers the whole frame with an overlapping pile, under a
 * card budget: the cards grow until the grid fits the budget, so a very wide
 * screen gets fewer, larger cards rather than bare patches.
 */
export function solveTideGrid(width: number, height: number): TideGrid {
  const narrow = width <= 720
  const budget = narrow ? 64 : width <= 1100 ? 84 : 140
  const minW = narrow ? Math.max(104, width * 0.28) : 150
  const maxW = narrow ? 160 : 300
  let cw = minW
  let cols = 2
  let rows = 2
  for (let guard = 0; guard < 40; guard++) {
    cols = Math.max(2, Math.ceil((width * TIDE_OVERSCAN) / (cw * TIDE_OVERLAP)))
    rows = Math.max(2, Math.ceil((height * TIDE_OVERSCAN) / (cw * CARD_RATIO * TIDE_OVERLAP)))
    if (cols * rows <= budget || cw >= maxW)
      break
    cw = Math.min(maxW, cw * 1.08)
  }
  cw = Math.round(Math.min(maxW, cw))
  return { cols, rows, cw, ch: Math.round(cw * CARD_RATIO), count: cols * rows }
}

/** Distinct images per world: fewer on a phone, where the grid is smaller. */
export function tideUniqueImages(width: number): number {
  return width <= 720 ? 20 : 48
}

/**
 * Which world a grid cell belongs to. Cells left of the middle are One Piece,
 * right of it Magic; an odd middle column alternates by row, so the two tides
 * interlock along the seam instead of meeting on a straight line.
 */
export function sideOfCell(col: number, row: number, cols: number): TideSide {
  const middle = (cols - 1) / 2
  if (col < middle)
    return 'op'
  if (col > middle)
    return 'mtg'
  return row % 2 ? 'mtg' : 'op'
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * The card of every cell, row by row. Each side walks its own shuffled pool,
 * limited to `unique` distinct images (the page downloads each one), and
 * repeats it when the grid needs more. A side with no cards borrows the other.
 */
export function dealTide(
  grid: Pick<TideGrid, 'cols' | 'count'>,
  op: readonly TideCard[],
  mtg: readonly TideCard[],
  { unique = 48, random = Math.random }: { unique?: number, random?: () => number } = {},
): TideCard[] {
  const pools: Record<TideSide, TideCard[]> = {
    op: shuffled(op, random).slice(0, unique),
    mtg: shuffled(mtg, random).slice(0, unique),
  }
  if (!pools.op.length && !pools.mtg.length)
    return []
  const next: Record<TideSide, number> = { op: 0, mtg: 0 }
  const out: TideCard[] = []
  for (let i = 0; i < grid.count; i++) {
    let side = sideOfCell(i % grid.cols, Math.floor(i / grid.cols), grid.cols)
    if (!pools[side].length)
      side = side === 'op' ? 'mtg' : 'op'
    const pool = pools[side]
    out.push(pool[next[side]++ % pool.length]!)
  }
  return out
}

// ---------------------------------------------------------------- showcase

export interface TideFrame {
  width: number
  height: number
  /** Space the fixed header covers at the top, px. */
  top: number
  /** The reading panel, in frame coordinates. */
  panel: { left: number, right: number, top: number, bottom: number }
  cw: number
  ch: number
}

export interface TideSlot {
  /** Top-left of the unscaled card, px (cards scale around their centre). */
  x: number
  y: number
  scale: number
}

/** Room a showcased card keeps from the panel and the frame edge, px. */
const SLOT_MARGIN = 24

/**
 * Where a showcased card rests: One Piece in the corridor left of the panel,
 * Magic in the one on its right, both centred on the panel and the same size.
 * On a frame too narrow for corridors, the two slots share the taller band
 * above or below the panel. Null when there is no room at all.
 */
export function showcaseSlot(side: TideSide, frame: TideFrame): TideSlot | null {
  const { width, height, top, panel, cw, ch } = frame
  const left = panel.left
  const right = width - panel.right
  const corridor = Math.min(left, right)

  if (corridor >= cw * 0.9 + SLOT_MARGIN * 2) {
    const byWidth = (corridor - SLOT_MARGIN * 2) / cw
    const byHeight = (height - top - SLOT_MARGIN * 2) / ch
    const scale = Math.max(0.9, Math.min(1.55, byWidth, byHeight))
    const cx = side === 'op' ? left / 2 : panel.right + right / 2
    const half = (ch * scale) / 2
    const cy = Math.max(top + SLOT_MARGIN + half, Math.min(height - SLOT_MARGIN - half, (panel.top + panel.bottom) / 2))
    return { x: cx - cw / 2, y: cy - ch / 2, scale }
  }

  const above = panel.top - top
  const below = height - panel.bottom
  const band = Math.max(above, below)
  const scale = Math.min(1.3, (band - SLOT_MARGIN) / ch, (width / 2 - SLOT_MARGIN * 1.5) / cw)
  if (scale < 0.55)
    return null
  const cx = side === 'op' ? width / 4 + SLOT_MARGIN / 4 : (width * 3) / 4 - SLOT_MARGIN / 4
  const cy = above >= below ? top + above / 2 : panel.bottom + below / 2
  return { x: cx - cw / 2, y: cy - ch / 2, scale }
}

/** True when showcased cards sit beside the panel rather than over the page. */
export function hasCorridors(frame: TideFrame): boolean {
  return Math.min(frame.panel.left, frame.width - frame.panel.right) >= frame.cw * 0.9 + SLOT_MARGIN * 2
}
