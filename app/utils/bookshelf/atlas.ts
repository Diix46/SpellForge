/**
 * Every spine of a bookcase in one texture: a grid of cells, one per binder,
 * each painted on its own (and again when its symbol or art arrives, or its
 * progress moves) — the scene reads its cell through per-instance UVs.
 * Drawn in a 128×512 space, scaled to the cell size the device can afford.
 */
import type * as Three from 'three'

export interface SpineSpec {
  name: string
  code: string
  hue: number
  owned: number
  total: number
  fresh: boolean
  /** Set symbol (Magic), as an image to recolour. */
  icon: HTMLImageElement | null
  /** The set's art, a strip of it across the spine. */
  art: HTMLImageElement | null
  freshLabel: string
  /** The leather's grain, pressed into the spine. */
  grain: HTMLImageElement | null
  /** Title face: an engraved serif for Magic, a poster face for One Piece. */
  font: string
  weight: number
}

const COLS = 16
const BASE_W = 128
const BASE_H = 512

export class SpineAtlas {
  readonly canvas: HTMLCanvasElement
  readonly texture: Three.CanvasTexture
  private readonly g: CanvasRenderingContext2D
  private readonly rows: number

  constructor(THREE: typeof Three, readonly capacity: number, readonly cellW: number, readonly cellH: number) {
    this.rows = Math.max(1, Math.ceil(capacity / COLS))
    this.canvas = document.createElement('canvas')
    this.canvas.width = COLS * cellW
    this.canvas.height = this.rows * cellH
    this.g = this.canvas.getContext('2d')!
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = 4
    this.texture.generateMipmaps = true
  }

  /** A cell's place in UV space (origin bottom left): offset x, y, scale x, y. */
  uv(i: number): [number, number, number, number] {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const sx = 1 / COLS
    const sy = 1 / this.rows
    return [col * sx, 1 - (row + 1) * sy, sx, sy]
  }

  /** Paint one spine (and flag the texture for upload). */
  draw(i: number, s: SpineSpec): void {
    const g = this.g
    const x = (i % COLS) * this.cellW
    const y = Math.floor(i / COLS) * this.cellH
    g.save()
    g.beginPath()
    g.rect(x, y, this.cellW, this.cellH)
    g.clip()
    g.translate(x, y)
    g.scale(this.cellW / BASE_W, this.cellH / BASE_H)
    paint(g, s)
    g.restore()
    this.texture.needsUpdate = true
  }

  dispose(): void {
    this.texture.dispose()
  }
}

/** Gold leaf: a metallic gradient across the lettering's height. */
function goldFoil(g: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
  const f = g.createLinearGradient(0, y0, 0, y1)
  f.addColorStop(0, '#fff3c2')
  f.addColorStop(0.28, '#e7c065')
  f.addColorStop(0.5, '#9c7224')
  f.addColorStop(0.72, '#e2b95c')
  f.addColorStop(1, '#fbe7a6')
  return f
}

/**
 * Text stamped into leather: a dark bevel below, a light one above, then the
 * leaf (or, on a cream binder, dark ink pressed in).
 */
function stamp(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, foil: boolean, done: boolean): void {
  g.fillStyle = 'rgba(0,0,0,0.55)'
  g.fillText(text, x + 0.9, y + 1.1)
  g.fillStyle = foil ? 'rgba(255,240,200,0.35)' : 'rgba(255,255,255,0.6)'
  g.fillText(text, x - 0.6, y - 0.7)
  g.fillStyle = foil ? goldFoil(g, y - size / 2, y + size / 2) : '#3a2a1e'
  if (done && foil)
    g.shadowColor = 'rgba(255,215,120,0.55)'
  g.shadowBlur = done && foil ? 6 : 0
  g.fillText(text, x, y)
  g.shadowBlur = 0
}

/** A thin gold (or ink) rule, stamped like the lettering. */
function rule(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, foil: boolean): void {
  g.fillStyle = 'rgba(0,0,0,0.5)'
  g.fillRect(x0, y + 1, x1 - x0, 1.5)
  g.fillStyle = foil ? goldFoil(g, y - 1, y + 2) : 'rgba(58,42,30,0.8)'
  g.fillRect(x0, y, x1 - x0, 1.6)
}

function paint(g: CanvasRenderingContext2D, s: SpineSpec): void {
  const done = !s.fresh && s.total > 0 && s.owned >= s.total
  const foil = !s.fresh
  const ink = foil ? '#f1e4c4' : '#3a2a1e'

  // Leather: the binder's colour, rounded by the light across the spine.
  const light = s.fresh ? 82 : 24
  const sat = s.fresh ? 12 : 44
  const leather = g.createLinearGradient(0, 0, BASE_W, 0)
  leather.addColorStop(0, `hsl(${s.hue} ${sat}% ${light - 9}%)`)
  leather.addColorStop(0.42, `hsl(${s.hue} ${sat + 4}% ${light + 7}%)`)
  leather.addColorStop(0.6, `hsl(${s.hue} ${sat + 2}% ${light + 3}%)`)
  leather.addColorStop(1, `hsl(${s.hue} ${sat}% ${light - 11}%)`)
  g.fillStyle = leather
  g.fillRect(0, 0, BASE_W, BASE_H)
  // The grain of the hide, pressed into the colour.
  if (s.grain) {
    g.save()
    g.globalCompositeOperation = 'multiply'
    g.globalAlpha = s.fresh ? 0.35 : 0.8
    g.drawImage(s.grain, (s.hue * 3) % 400, (s.hue * 7) % 300, 180, 720, 0, 0, BASE_W, BASE_H)
    g.restore()
  }

  // Raised bands across the spine, as on a bound book.
  for (const y of [34, 468]) {
    const band = g.createLinearGradient(0, y - 7, 0, y + 7)
    band.addColorStop(0, 'rgba(0,0,0,0.35)')
    band.addColorStop(0.45, 'rgba(255,255,255,0.18)')
    band.addColorStop(1, 'rgba(0,0,0,0.4)')
    g.fillStyle = band
    g.fillRect(0, y - 7, BASE_W, 14)
    rule(g, 10, BASE_W - 10, y - 11, foil || done)
    rule(g, 10, BASE_W - 10, y + 10, foil || done)
  }

  // The symbol, stamped in a medallion.
  g.fillStyle = s.fresh ? 'rgba(90,70,50,0.12)' : 'rgba(0,0,0,0.3)'
  g.beginPath()
  g.arc(64, 84, 27, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = foil ? goldFoil(g, 57, 111) : 'rgba(58,42,30,0.6)'
  g.lineWidth = 1.6
  g.stroke()
  if (s.icon) {
    const c = document.createElement('canvas')
    c.width = 88
    c.height = 88
    const cg = c.getContext('2d')!
    cg.drawImage(s.icon, 0, 0, 88, 88)
    cg.globalCompositeOperation = 'source-in'
    cg.fillStyle = foil ? goldFoil(cg, 0, 88) : '#3a2a1e'
    cg.fillRect(0, 0, 88, 88)
    g.drawImage(c, 42, 62, 44, 44)
  }
  else {
    g.font = `${s.weight} 20px ${s.font}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    stamp(g, s.code.toUpperCase().replace('-', '').slice(0, 5), 64, 85, 20, foil, done)
  }

  // A small window with the set's art, in a gold frame.
  const ax = 20
  const ay = 128
  const aw = 88
  const ah = 96
  if (s.art) {
    const ratio = aw / ah
    const iw = s.art.naturalWidth || s.art.width
    const ih = s.art.naturalHeight || s.art.height
    let sw = iw
    let sh = iw / ratio
    if (sh > ih) {
      sh = ih
      sw = ih * ratio
    }
    g.drawImage(s.art, (iw - sw) / 2, (ih - sh) / 2, sw, sh, ax, ay, aw, ah)
    // Varnish, a little sheen.
    const sheen = g.createLinearGradient(ax, ay, ax + aw, ay + ah)
    sheen.addColorStop(0, 'rgba(255,255,255,0.18)')
    sheen.addColorStop(0.4, 'rgba(255,255,255,0)')
    g.fillStyle = sheen
    g.fillRect(ax, ay, aw, ah)
    if (s.fresh) {
      g.fillStyle = 'rgba(255,250,240,0.2)'
      g.fillRect(ax, ay, aw, ah)
    }
  }
  else {
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(ax, ay, aw, ah)
  }
  g.lineWidth = 3
  g.strokeStyle = 'rgba(0,0,0,0.5)'
  g.strokeRect(ax - 1, ay - 1, aw + 2, ah + 2)
  g.lineWidth = 2
  g.strokeStyle = foil ? goldFoil(g, ay, ay + ah) : 'rgba(58,42,30,0.7)'
  g.strokeRect(ax - 2.5, ay - 2.5, aw + 5, ah + 5)

  // The title label: a darker panel set into the spine, lettering in leaf.
  const lx = 14
  const ly = 238
  const lw = 100
  const lh = 188
  g.fillStyle = s.fresh ? 'rgba(90,70,50,0.08)' : 'rgba(0,0,0,0.32)'
  g.fillRect(lx, ly, lw, lh)
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.fillRect(lx, ly, lw, 2)
  g.fillStyle = 'rgba(255,255,255,0.12)'
  g.fillRect(lx, ly + lh - 2, lw, 2)
  g.lineWidth = 1.4
  g.strokeStyle = foil ? goldFoil(g, ly, ly + lh) : 'rgba(58,42,30,0.55)'
  g.strokeRect(lx + 4, ly + 4, lw - 8, lh - 8)

  // The name, reading bottom to top: one line as large as it fits, else two.
  g.save()
  g.translate(64, ly + lh - 12)
  g.rotate(-Math.PI / 2)
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  const room = lh - 24
  const fits = (text: string, size: number) => {
    g.font = `${s.weight} ${size}px ${s.font}`
    return g.measureText(text).width <= room
  }
  let size = 36
  while (size > 21 && !fits(s.name, size))
    size -= 1
  if (fits(s.name, size)) {
    stamp(g, s.name, 0, 0, size, foil, done)
  }
  else {
    const words = s.name.split(' ')
    let best: [string, string] = [s.name, '']
    let worst = Infinity
    g.font = `${s.weight} 20px ${s.font}`
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(' ')
      const b = words.slice(k).join(' ')
      const w = Math.max(g.measureText(a).width, g.measureText(b).width)
      if (w < worst) {
        worst = w
        best = [a, b]
      }
    }
    size = 24
    while (size > 12 && !(fits(best[0], size) && fits(best[1], size)))
      size -= 1
    g.font = `${s.weight} ${size}px ${s.font}`
    const clip = (text: string) => {
      let out = text
      while (out.length > 3 && g.measureText(out).width > room)
        out = `${out.slice(0, -2)}…`
      return out
    }
    stamp(g, clip(best[0]), 0, -size * 0.6, size, foil, done)
    stamp(g, clip(best[1]), 0, size * 0.6, size, foil, done)
  }
  g.restore()

  // The foot: the set code, and the progress or the "new" tag.
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `${s.weight} 15px ${s.font}`
  stamp(g, s.code.toUpperCase().slice(0, 6), 64, 441, 15, foil, done)
  if (s.fresh) {
    g.fillStyle = '#b8322a'
    g.fillRect(16, 484, 96, 20)
    g.fillStyle = '#fff'
    g.font = '700 12px system-ui, sans-serif'
    g.fillText(s.freshLabel.toUpperCase(), 64, 494.5)
  }
  else {
    const ratio = s.total ? Math.min(1, s.owned / s.total) : 0
    g.fillStyle = 'rgba(0,0,0,0.45)'
    g.fillRect(18, 482, 92, 7)
    g.fillStyle = done ? goldFoil(g, 482, 489) : '#86d6ae'
    g.fillRect(18, 482, Math.max(3, 92 * ratio), 7)
    g.font = '700 12px ui-monospace, monospace'
    g.fillStyle = done ? '#f3d886' : ink
    g.fillText(done ? '★ 100%' : `${Math.floor(ratio * 100)}%`, 64, 499)
  }
}
