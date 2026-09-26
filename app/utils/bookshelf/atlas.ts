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

function paint(g: CanvasRenderingContext2D, s: SpineSpec): void {
  const done = !s.fresh && s.total > 0 && s.owned >= s.total
  // A new binder: cream, still in its shrink wrap.
  const sat = s.fresh ? 14 : 42
  const light = s.fresh ? 84 : 22
  // Leather: a rounded light across, darker edges.
  const leather = g.createLinearGradient(0, 0, BASE_W, 0)
  leather.addColorStop(0, `hsl(${s.hue} ${sat}% ${light - 8}%)`)
  leather.addColorStop(0.45, `hsl(${s.hue} ${sat + 6}% ${light + 8}%)`)
  leather.addColorStop(1, `hsl(${s.hue} ${sat}% ${light - 10}%)`)
  g.fillStyle = leather
  g.fillRect(0, 0, BASE_W, BASE_H)
  // Grain.
  g.fillStyle = s.fresh ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'
  for (let k = 0; k < 90; k++) {
    const px = (k * 37) % BASE_W
    const py = (k * 97) % BASE_H
    g.fillRect(px, py, 2, 1)
  }
  // Head and foot bands, stitched.
  const band = done ? '#d9b45a' : s.fresh ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.35)'
  g.fillStyle = band
  g.fillRect(0, 0, BASE_W, 26)
  g.fillRect(0, BASE_H - 26, BASE_W, 26)
  g.strokeStyle = done ? 'rgba(255,240,200,0.8)' : 'rgba(255,255,255,0.28)'
  g.setLineDash([5, 4])
  g.lineWidth = 1.5
  g.beginPath()
  g.moveTo(6, 30)
  g.lineTo(BASE_W - 6, 30)
  g.moveTo(6, BASE_H - 30)
  g.lineTo(BASE_W - 6, BASE_H - 30)
  g.stroke()
  g.setLineDash([])

  const ink = s.fresh ? '#2a2420' : '#f6f0e4'
  const gold = '#f0d27a'
  // The symbol, or the set code in a medallion.
  g.fillStyle = s.fresh ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.28)'
  g.beginPath()
  g.arc(64, 72, 32, 0, Math.PI * 2)
  g.fill()
  if (s.icon) {
    const c = document.createElement('canvas')
    c.width = 52
    c.height = 52
    const cg = c.getContext('2d')!
    cg.drawImage(s.icon, 0, 0, 52, 52)
    cg.globalCompositeOperation = 'source-in'
    cg.fillStyle = done ? gold : ink
    cg.fillRect(0, 0, 52, 52)
    g.drawImage(c, 38, 46)
  }
  else {
    g.fillStyle = ink
    g.font = '800 17px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(s.code.toUpperCase().replace('-', '').slice(0, 5), 64, 72)
  }

  // A strip of the set's art, framed.
  const ax = 14
  const ay = 118
  const aw = 100
  const ah = 118
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
    if (s.fresh) {
      g.fillStyle = 'rgba(255,255,255,0.25)'
      g.fillRect(ax, ay, aw, ah)
    }
  }
  else {
    g.fillStyle = `hsl(${s.hue} ${sat}% ${light + 16}%)`
    g.fillRect(ax, ay, aw, ah)
  }
  g.strokeStyle = done ? gold : 'rgba(255,255,255,0.45)'
  g.lineWidth = 2
  g.strokeRect(ax + 1, ay + 1, aw - 2, ah - 2)

  // The name, reading bottom to top: one line as large as it fits, else
  // two lines split at a space, else shortened.
  g.save()
  g.translate(64, 430)
  g.rotate(-Math.PI / 2)
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.fillStyle = ink
  const room = 180
  const fits = (text: string, size: number) => {
    g.font = `700 ${size}px system-ui, sans-serif`
    return g.measureText(text).width <= room
  }
  let size = 34
  while (size > 22 && !fits(s.name, size))
    size -= 1
  if (fits(s.name, size)) {
    g.fillText(s.name, 0, 0)
  }
  else {
    // Two lines: the split that balances them best.
    const words = s.name.split(' ')
    let best: [string, string] = [s.name, '']
    let worst = Infinity
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(' ')
      const b = words.slice(k).join(' ')
      g.font = '700 20px system-ui, sans-serif'
      const w = Math.max(g.measureText(a).width, g.measureText(b).width)
      if (w < worst) {
        worst = w
        best = [a, b]
      }
    }
    size = 22
    while (size > 13 && !(fits(best[0], size) && fits(best[1], size)))
      size -= 1
    const clip = (text: string) => {
      g.font = `700 ${size}px system-ui, sans-serif`
      let out = text
      while (out.length > 3 && g.measureText(out).width > room)
        out = `${out.slice(0, -2)}…`
      return out
    }
    g.font = `700 ${size}px system-ui, sans-serif`
    g.fillText(clip(best[0]), 0, -size * 0.62)
    g.fillText(clip(best[1]), 0, size * 0.62)
  }
  g.restore()

  // Progress at the foot, or the "new" tag.
  if (s.fresh) {
    g.fillStyle = '#c0392b'
    g.fillRect(12, 452, 104, 24)
    g.fillStyle = '#fff'
    g.font = '800 13px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(s.freshLabel.toUpperCase(), 64, 465)
  }
  else {
    const ratio = s.total ? Math.min(1, s.owned / s.total) : 0
    g.fillStyle = 'rgba(0,0,0,0.4)'
    g.fillRect(14, 456, 100, 9)
    g.fillStyle = done ? gold : '#7fd1a8'
    g.fillRect(14, 456, Math.max(3, 100 * ratio), 9)
    g.fillStyle = done ? gold : 'rgba(246,240,228,0.85)'
    g.font = '700 14px ui-monospace, monospace'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(done ? '★ 100%' : `${Math.floor(ratio * 100)}%`, 64, 476)
  }
}
