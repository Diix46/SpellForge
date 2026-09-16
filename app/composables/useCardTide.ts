import type { Ref } from 'vue'
import type { TideCard, TideFrame, TideGrid, TideSide, TideSlot } from '~/utils/cardTide'
import { nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { dealTide, hasCorridors, showcaseSlot, solveTideGrid, TIDE_OVERSCAN, tideUniqueImages } from '~/utils/cardTide'

/**
 * The motion of the landing's card tide: dozens of real cards dumped over the
 * hero, One Piece on the left and Magic on the right. The pile breathes (CSS),
 * drifts in depth with the pointer, shoves away from it, lifts under it, lets
 * a card be grabbed and thrown, and sends a clicked card to its world's
 * showcase beside the reading panel. When nobody touches it, it deals a card
 * to each showcase in turn.
 *
 * The design is the one the first landing shipped, kept for its smoothness:
 * - node state is plain, not reactive (mutating 140 cards per frame through
 *   Vue would thrash); only the dealt cards and the showcased ones are refs;
 * - one animation frame loop, started by input and stopped as soon as
 *   everything has settled, so an idle page costs nothing but CSS;
 * - each frame reads its inputs once, then writes rounded transforms, and
 *   skips cards whose transform has not changed;
 * - `will-change` only on the cards that are moving on their own.
 *
 * The panel the pile flows around is the element marked `data-tide-pocket`.
 * The eased pointer is written as `--tide-px` / `--tide-py` (-1 to 1) on the
 * overlay, with `--tide-ratio` (frame width over panel width), so the page can
 * lean its seam without a loop of its own.
 */

type Role = 'pile' | 'zoned' | 'dragging' | 'thrown'

interface Node {
  side: TideSide
  layer: number
  homeX: number
  homeY: number
  homeRot: number
  baseScale: number
  z: number
  cx: number
  cy: number
  crot: number
  cscale: number
  vx: number
  vy: number
  /** Offset from the pointer's push, eased toward its target. */
  px: number
  py: number
  tpx: number
  tpy: number
  role: Role
  hovered: boolean
  lastT: string
  active: boolean
}

// Spring and push.
const K_POS = 0.12
const DAMP = 0.86
const K_ROT = 0.1
const PUSH_RADIUS = 190
const PUSH_DEADZONE = 70
const PUSH = 64
const FRICTION = 0.93
const MAX_THROW = 32
// Pointer depth: how far each layer drifts (deepest to nearest), and how fast.
const PARALLAX = [6, 12, 20] as const
const PARALLAX_EASE = 0.05
// The idle showcase.
const DEAL_EVERY_MS = 5000
const DEAL_IDLE_MS = 3000
const FIRST_DEAL_MS = [900, 1600] as const
const DEAL_CANDIDATES = 8
// Stacking tiers: the pile stays under 300, a showcased card above it, a held
// or thrown card above everything.
const Z_ZONE = 9000
const Z_DRAG = 9500
// Space the fixed landing header covers.
const TOP_INSET = 72

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

export function useCardTide(
  root: Readonly<Ref<HTMLElement | null>>,
  overlay: Readonly<Ref<HTMLElement | null>>,
  wash: Readonly<Ref<HTMLElement | null>>,
  pools: () => { op: readonly TideCard[], mtg: readonly TideCard[] },
) {
  /** The card of every pile slot, in DOM order. */
  const cards = shallowRef<TideCard[]>([])
  /** The card each showcase holds. */
  const shown = shallowRef<Record<TideSide, TideCard | null>>({ op: null, mtg: null })

  let nodes: Node[] = []
  let els: HTMLElement[] = []
  let grid: TideGrid = solveTideGrid(1440, 900)
  let frame: TideFrame | null = null
  const slotOf: Record<TideSide, TideSlot | null> = { op: null, mtg: null }
  const holder: Record<TideSide, number> = { op: -1, mtg: -1 }
  const candidates: Record<TideSide, number[]> = { op: [], mtg: [] }
  let corridors = false
  let builtW = 0
  let builtH = 0

  let reduce = false
  let mounted = false
  let visible = true
  let raf = 0
  let last = 0
  let pointerInside = false
  let mx = 0
  let my = 0
  let pdx = 0
  let pdy = 0
  let pdxTarget = 0
  let pdyTarget = 0
  let lastVars = ''
  let lastInputAt = 0

  let downIndex = -1
  let downWasShowcase = false
  let downX = 0
  let downY = 0
  let downT = 0
  let dragIndex = -1
  let dragPointer = -1
  let grabDX = 0
  let grabDY = 0
  const ring: { x: number, y: number, t: number }[] = []

  let dealTimer: ReturnType<typeof setInterval> | null = null
  const firstDeals: ReturnType<typeof setTimeout>[] = []
  let nextSide: TideSide = 'op'
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  let ro: ResizeObserver | null = null
  let io: IntersectionObserver | null = null

  // ------------------------------------------------------------ loop

  function kick() {
    if (reduce || !visible || raf)
      return
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }

  function setActive(i: number, on: boolean) {
    const node = nodes[i]
    if (!node || node.active === on)
      return
    node.active = on
    const el = els[i]
    if (el)
      el.style.willChange = on ? 'transform' : ''
  }

  function write(node: Node, el: HTMLElement) {
    // Only resting pile cards drift with the pointer; a held or showcased card
    // keeps its own pose.
    const depth = node.role === 'pile' ? PARALLAX[node.layer as 0 | 1 | 2] : 0
    const x = Math.round(node.cx + node.px - pdx * depth)
    const y = Math.round(node.cy + node.py - pdy * depth)
    const t = `translate3d(${x}px,${y}px,0) rotate(${node.crot.toFixed(1)}deg) scale(${node.cscale.toFixed(3)})`
    if (t !== node.lastT) {
      el.style.transform = t
      node.lastT = t
    }
  }

  function writeVars() {
    const px = pdx.toFixed(3)
    const py = pdy.toFixed(3)
    const vars = `${px}|${py}`
    if (vars === lastVars || !overlay.value)
      return
    overlay.value.style.setProperty('--tide-px', px)
    overlay.value.style.setProperty('--tide-py', py)
    lastVars = vars
  }

  function target(node: Node): { x: number, y: number, rot: number, scale: number } {
    const slot = node.role === 'zoned' ? slotOf[node.side] : null
    if (slot)
      return { x: slot.x, y: slot.y, rot: 0, scale: slot.scale }
    if (node.hovered)
      return { x: node.homeX, y: node.homeY - 14, rot: node.homeRot * 0.6, scale: node.baseScale * 1.12 }
    return { x: node.homeX, y: node.homeY, rot: node.homeRot, scale: node.baseScale }
  }

  function tick(now: number) {
    raf = 0
    const dt = Math.min((now - last) / 16.667, 2)
    last = now
    const width = frame?.width ?? 0
    const height = frame?.height ?? 0

    pdx += (pdxTarget - pdx) * PARALLAX_EASE * dt
    pdy += (pdyTarget - pdy) * PARALLAX_EASE * dt
    let busy = Math.abs(pdxTarget - pdx) > 0.001 || Math.abs(pdyTarget - pdy) > 0.001
    writeVars()

    const r2 = PUSH_RADIUS * PUSH_RADIUS
    const dead2 = PUSH_DEADZONE * PUSH_DEADZONE
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!
      const el = els[i]
      if (!el)
        continue

      if (node.role === 'dragging') {
        busy = true
        write(node, el)
        continue
      }

      // Cards near the pointer are shoved away in a wave; the one under it
      // stays put to be clicked, and so do those right beside it.
      node.tpx = 0
      node.tpy = 0
      if (pointerInside && node.role === 'pile' && !node.hovered) {
        const dx = node.cx + grid.cw / 2 - mx
        const dy = node.cy + grid.ch / 2 - my
        const d2 = dx * dx + dy * dy
        if (d2 < r2 && d2 > dead2) {
          const d = Math.sqrt(d2)
          const f = (1 - d2 / r2) * PUSH * (0.5 + node.layer * 0.35)
          node.tpx = (dx / d) * f
          node.tpy = (dy / d) * f
        }
      }
      node.px += (node.tpx - node.px) * 0.18 * dt
      node.py += (node.tpy - node.py) * 0.18 * dt
      const pushing = Math.abs(node.px - node.tpx) > 0.3 || Math.abs(node.py - node.tpy) > 0.3

      if (node.role === 'thrown') {
        node.cx = Math.max(-grid.cw, Math.min(width - grid.cw * 0.2, node.cx + node.vx * dt))
        node.cy = Math.max(-grid.ch, Math.min(height - grid.ch * 0.2, node.cy + node.vy * dt))
        node.vx *= FRICTION
        node.vy *= FRICTION
        if (Math.hypot(node.vx, node.vy) < 0.4) {
          // It lands among the others: this is its new home.
          node.homeX = node.cx
          node.homeY = node.cy
          node.role = 'pile'
          el.style.zIndex = String(node.z)
          setActive(i, false)
        }
        busy = true
        write(node, el)
        continue
      }

      const goal = target(node)
      const dx = goal.x - node.cx
      const dy = goal.y - node.cy
      const dr = goal.rot - node.crot
      const ds = goal.scale - node.cscale
      node.vx = (node.vx + dx * K_POS) * DAMP
      node.vy = (node.vy + dy * K_POS) * DAMP
      node.cx += node.vx * dt
      node.cy += node.vy * dt
      node.crot += dr * K_ROT * dt
      node.cscale += ds * 0.12 * dt

      const moving = Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4 || Math.abs(node.vx) > 0.05 || Math.abs(node.vy) > 0.05 || Math.abs(dr) > 0.2 || Math.abs(ds) > 0.003
      if (moving || pushing) {
        busy = true
      }
      else {
        node.cx = goal.x
        node.cy = goal.y
        node.crot = goal.rot
        node.cscale = goal.scale
        node.vx = 0
        node.vy = 0
      }
      write(node, el)
    }

    if (busy)
      raf = requestAnimationFrame(tick)
  }

  // ------------------------------------------------------------ layout

  function measure() {
    const el = root.value
    if (!el)
      return
    const width = el.clientWidth
    const height = el.clientHeight
    const box = el.getBoundingClientRect()
    const pocket = el.querySelector<HTMLElement>('[data-tide-pocket]')?.getBoundingClientRect()
    const panel = pocket
      ? { left: pocket.left - box.left, right: pocket.right - box.left, top: pocket.top - box.top, bottom: pocket.bottom - box.top }
      : { left: width / 2 - 300, right: width / 2 + 300, top: height / 2 - 220, bottom: height / 2 + 220 }
    frame = { width, height, top: TOP_INSET, panel, cw: grid.cw, ch: grid.ch }
    slotOf.op = showcaseSlot('op', frame)
    slotOf.mtg = showcaseSlot('mtg', frame)
    corridors = hasCorridors(frame)
    el.style.setProperty('--cw', `${grid.cw}px`)
    el.style.setProperty('--ch', `${grid.ch}px`)
    overlay.value?.style.setProperty('--tide-ratio', (width / Math.max(1, panel.right - panel.left)).toFixed(3))
    // A showcase that no longer has room sends its card home.
    for (const side of ['op', 'mtg'] as const) {
      if (!slotOf[side] && holder[side] >= 0)
        sendHome(holder[side])
    }
  }

  function scatter() {
    if (!frame)
      return
    const { width, height, panel } = frame
    const { cols, rows, cw, ch } = grid
    const pitchX = (width * TIDE_OVERSCAN) / cols
    const pitchY = (height * TIDE_OVERSCAN) / rows
    const offX = (-width * (TIDE_OVERSCAN - 1)) / 2
    const offY = (-height * (TIDE_OVERSCAN - 1)) / 2
    // The pocket the panel sits in: cards are pushed to its rim.
    const pcx = (panel.left + panel.right) / 2
    const pcy = (panel.top + panel.bottom) / 2
    const rx = Math.min(width * 0.46, (panel.right - panel.left) / 2 + 12)
    const ry = Math.min(height * 0.42, ((panel.bottom - panel.top) / 2) * 0.85)
    const maxDist = Math.hypot(width, height) / 2

    nodes.forEach((node, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      // Cell centre, jittered under half a pitch so the grid dissolves into a
      // messy pile without opening gaps, with a slight diagonal current.
      let x = offX + (col + 0.5) * pitchX + rand(-0.3, 0.3) * pitchX + Math.sin((row + col) * 0.6) * 6
      let y = offY + (row + 0.5) * pitchY + rand(-0.3, 0.3) * pitchY
      const nx = (x - pcx) / rx
      const ny = (y - pcy) / ry
      const reach = Math.hypot(nx, ny)
      if (reach < 1) {
        const angle = Math.atan2(ny, nx)
        const margin = rand(12, 30)
        x = pcx + Math.cos(angle) * (rx + margin)
        y = pcy + Math.sin(angle) * (ry + margin)
      }
      const depth = Math.min(1, Math.max(0, (Math.hypot(x - pcx, y - pcy) / maxDist) * 0.7 + Math.random() * 0.3))
      node.layer = depth < 0.34 ? 0 : depth < 0.67 ? 1 : 2
      node.baseScale = [0.82, 0.94, 1.06][node.layer]!
      const edge = reach > 1.4 ? 6 : 0
      node.homeRot = rand(-20 - edge, 20 + edge)
      node.homeX = x - cw / 2
      node.homeY = y - ch / 2
      node.z = node.layer * 100 + (i % 90)
      if (node.role !== 'zoned') {
        node.role = 'pile'
        node.cx = node.homeX
        node.cy = node.homeY
        node.crot = node.homeRot
        node.cscale = node.baseScale
      }
      node.vx = 0
      node.vy = 0
      node.px = 0
      node.py = 0
      node.tpx = 0
      node.tpy = 0
      node.hovered = false
      node.lastT = ''
      const el = els[i]
      if (!el)
        return
      if (node.role !== 'zoned')
        el.style.zIndex = String(node.z)
      const inner = el.firstElementChild as HTMLElement | null
      inner?.style.setProperty('--bd', `${rand(7, 13).toFixed(2)}s`)
      inner?.style.setProperty('--bdl', `${rand(-6, 0).toFixed(2)}s`)
      if (reduce && node.role === 'zoned')
        snap(i)
      else
        write(node, el)
    })
  }

  function pickCandidates() {
    for (const side of ['op', 'mtg'] as const) {
      const pool = nodes.flatMap((n, i) => (n.side === side ? [i] : []))
      // A short, fixed list: the idle showcase reuses a few full images
      // instead of downloading a new one every few seconds.
      candidates[side] = pool.sort(() => Math.random() - 0.5).slice(0, DEAL_CANDIDATES)
    }
  }

  async function build() {
    const el = root.value
    if (!el)
      return
    const width = el.clientWidth
    const height = el.clientHeight
    const { op, mtg } = pools()
    if (!width || !height || (!op.length && !mtg.length))
      return
    grid = solveTideGrid(width, height)
    const dealt = dealTide(grid, op, mtg, { unique: tideUniqueImages(width) })
    holder.op = -1
    holder.mtg = -1
    shown.value = { op: null, mtg: null }
    nodes = dealt.map(c => ({
      side: c.side,
      layer: 0,
      homeX: 0,
      homeY: 0,
      homeRot: 0,
      baseScale: 1,
      z: 0,
      cx: 0,
      cy: 0,
      crot: 0,
      cscale: 1,
      vx: 0,
      vy: 0,
      px: 0,
      py: 0,
      tpx: 0,
      tpy: 0,
      role: 'pile',
      hovered: false,
      lastT: '',
      active: false,
    }))
    cards.value = dealt
    await nextTick()
    els = Array.from(el.querySelectorAll<HTMLElement>('[data-tide-card]'))
    builtW = width
    builtH = height
    measure()
    scatter()
    pickCandidates()
    firstShowcase()
  }

  /** New pools (another language): same places, new cards. */
  function swapCards() {
    const { op, mtg } = pools()
    if (!nodes.length) {
      void build()
      return
    }
    // A language switch empties a pool for a moment; keep the current cards.
    if (!op.length || !mtg.length)
      return
    const dealt = dealTide(grid, op, mtg, { unique: tideUniqueImages(builtW) })
    if (dealt.length !== nodes.length || dealt.some((c, i) => c.side !== nodes[i]!.side)) {
      void build()
      return
    }
    cards.value = dealt
    shown.value = {
      op: holder.op >= 0 ? dealt[holder.op]! : null,
      mtg: holder.mtg >= 0 ? dealt[holder.mtg]! : null,
    }
    for (const side of ['op', 'mtg'] as const) {
      if (holder[side] >= 0)
        paintAccent(side, dealt[holder[side]]!)
    }
  }

  function onResize() {
    if (resizeTimer)
      clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      const el = root.value
      if (!el)
        return
      if (Math.abs(el.clientWidth - builtW) > 1 || Math.abs(el.clientHeight - builtH) > 60) {
        void build()
        return
      }
      measure()
      kick()
    }, 200)
  }

  // ------------------------------------------------------------ showcase

  function paintAccent(side: TideSide, card: TideCard | null) {
    wash.value?.style.setProperty(side === 'op' ? '--op-glow' : '--mtg-glow', card ? `rgb(${card.accent})` : 'transparent')
  }

  function show(side: TideSide, card: TideCard | null) {
    shown.value = { ...shown.value, [side]: card }
    paintAccent(side, card)
  }

  function snap(i: number) {
    const node = nodes[i]
    const el = els[i]
    if (!node || !el)
      return
    const goal = target(node)
    node.cx = goal.x
    node.cy = goal.y
    node.crot = goal.rot
    node.cscale = goal.scale
    write(node, el)
  }

  /** A showcased card gets its full image when the light copy would blur. */
  function sharpen(i: number, slot: TideSlot) {
    const card = cards.value[i]
    const img = els[i]?.querySelector('img')
    if (!card || !img || card.full === card.image || img.dataset.full === card.full)
      return
    if (grid.cw * slot.scale * (window.devicePixelRatio || 1) <= 340)
      return
    img.dataset.full = card.full
    img.src = card.full
  }

  function sendToShowcase(i: number) {
    const node = nodes[i]
    const el = els[i]
    const slot = node ? slotOf[node.side] : null
    if (!node || !el || !slot || node.role === 'dragging' || node.role === 'thrown')
      return
    const side = node.side
    if (holder[side] >= 0 && holder[side] !== i)
      sendHome(holder[side], false)
    holder[side] = i
    node.role = 'zoned'
    node.hovered = false
    el.style.zIndex = String(Z_ZONE + (side === 'mtg' ? 1 : 0))
    setActive(i, true)
    sharpen(i, slot)
    show(side, cards.value[i] ?? null)
    if (reduce)
      snap(i)
    else
      kick()
  }

  function sendHome(i: number, clearShown = true) {
    const node = nodes[i]
    if (!node || node.role !== 'zoned')
      return
    if (holder[node.side] === i)
      holder[node.side] = -1
    node.role = 'pile'
    const el = els[i]
    if (el)
      el.style.zIndex = String(node.z)
    setActive(i, false)
    if (clearShown)
      show(node.side, null)
    if (reduce)
      snap(i)
    else
      kick()
  }

  function toggle(i: number) {
    const node = nodes[i]
    if (!node)
      return
    if (node.role === 'zoned')
      sendHome(i)
    else
      sendToShowcase(i)
  }

  /** Sends a world's showcased card back to the pile. */
  function clear(side: TideSide) {
    if (holder[side] >= 0)
      sendHome(holder[side])
  }

  function deal(side: TideSide) {
    const pool = candidates[side].filter(i => nodes[i]?.role === 'pile' && holder[side] !== i)
    const pick = pool[Math.floor(Math.random() * pool.length)]
    if (pick !== undefined)
      sendToShowcase(pick)
  }

  function firstShowcase() {
    firstDeals.splice(0).forEach(clearTimeout)
    if (!corridors)
      return
    if (reduce) {
      deal('op')
      deal('mtg')
      return
    }
    firstDeals.push(
      setTimeout(() => holder.op < 0 && deal('op'), FIRST_DEAL_MS[0]),
      setTimeout(() => holder.mtg < 0 && deal('mtg'), FIRST_DEAL_MS[1]),
    )
  }

  function startDealing() {
    if (reduce || dealTimer)
      return
    dealTimer = setInterval(() => {
      if (!visible || document.hidden || !corridors || dragIndex >= 0)
        return
      if (performance.now() - lastInputAt < DEAL_IDLE_MS)
        return
      deal(nextSide)
      nextSide = nextSide === 'op' ? 'mtg' : 'op'
    }, DEAL_EVERY_MS)
  }

  // ------------------------------------------------------------ pointer

  function local(e: PointerEvent): { x: number, y: number } {
    const box = root.value?.getBoundingClientRect()
    return { x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0) }
  }

  function onMove(e: PointerEvent) {
    if (e.pointerType === 'touch' || reduce || !frame)
      return
    const p = local(e)
    mx = p.x
    my = p.y
    const cx = frame.width / 2
    const cy = frame.height / 2
    pdxTarget = Math.max(-1, Math.min(1, (mx - cx) / (cx || 1)))
    pdyTarget = Math.max(-1, Math.min(1, (my - cy) / (cy || 1)))
    pointerInside = true
    lastInputAt = performance.now()
    if (dragIndex >= 0 && e.pointerId === dragPointer) {
      const node = nodes[dragIndex]!
      node.cx = mx - grabDX
      node.cy = my - grabDY
      ring.push({ x: mx, y: my, t: performance.now() })
      if (ring.length > 5)
        ring.shift()
    }
    kick()
  }

  function onLeave(e?: PointerEvent) {
    if (e?.pointerType === 'touch' || dragIndex >= 0)
      return
    pointerInside = false
    pdxTarget = 0
    pdyTarget = 0
    for (const node of nodes) {
      node.hovered = false
      node.tpx = 0
      node.tpy = 0
    }
    kick()
  }

  function indexOf(target: EventTarget | null): number {
    const el = (target as Element | null)?.closest?.('[data-tide-card]') as HTMLElement | null
    return el ? Number(el.dataset.tideCard) : -1
  }

  function onOver(e: PointerEvent) {
    if (e.pointerType === 'touch' || reduce)
      return
    const i = indexOf(e.target)
    const node = nodes[i]
    if (!node || node.role !== 'pile' || node.hovered)
      return
    node.hovered = true
    kick()
  }

  function onOut(e: PointerEvent) {
    const i = indexOf(e.target)
    if (i < 0 || indexOf(e.relatedTarget) === i)
      return
    const node = nodes[i]
    if (node?.hovered) {
      node.hovered = false
      kick()
    }
  }

  function onDown(e: PointerEvent) {
    const i = indexOf(e.target)
    const node = nodes[i]
    const el = els[i]
    if (!node || !el || e.button !== 0)
      return
    lastInputAt = performance.now()
    downIndex = i
    downX = e.clientX
    downY = e.clientY
    downT = performance.now()
    // Touch keeps the page scrolling: a tap showcases, nothing is dragged.
    if (reduce || e.pointerType === 'touch')
      return
    e.preventDefault()
    const p = local(e)
    downWasShowcase = node.role === 'zoned'
    // A held card leaves its showcase.
    if (downWasShowcase) {
      holder[node.side] = -1
      show(node.side, null)
    }
    el.setPointerCapture?.(e.pointerId)
    dragIndex = i
    dragPointer = e.pointerId
    node.role = 'dragging'
    node.hovered = false
    node.vx = 0
    node.vy = 0
    node.tpx = 0
    node.tpy = 0
    el.style.zIndex = String(Z_DRAG)
    setActive(i, true)
    grabDX = p.x - node.cx
    grabDY = p.y - node.cy
    ring.length = 0
    ring.push({ x: p.x, y: p.y, t: performance.now() })
    kick()
  }

  function onUp(e: PointerEvent) {
    const i = downIndex
    downIndex = -1
    if (i < 0)
      return
    const tap = Math.hypot(e.clientX - downX, e.clientY - downY) < 8 && performance.now() - downT < 400
    if (dragIndex !== i) {
      if (tap)
        toggle(i)
      return
    }
    const node = nodes[i]!
    const el = els[i]!
    el.releasePointerCapture?.(e.pointerId)
    dragIndex = -1
    dragPointer = -1

    if (tap) {
      // A click: back to the pile if it was showcased, else to its showcase.
      node.role = 'pile'
      el.style.zIndex = String(node.z)
      setActive(i, false)
      if (!downWasShowcase)
        sendToShowcase(i)
      kick()
      return
    }

    let vx = 0
    let vy = 0
    const first = ring[0]
    const latest = ring[ring.length - 1]
    // A slow drag that stops is a place-down, not a throw.
    if (first && latest && latest.t > first.t && performance.now() - latest.t < 120) {
      vx = ((latest.x - first.x) / (latest.t - first.t)) * 16.667
      vy = ((latest.y - first.y) / (latest.t - first.t)) * 16.667
    }
    node.vx = Math.max(-MAX_THROW, Math.min(MAX_THROW, vx))
    node.vy = Math.max(-MAX_THROW, Math.min(MAX_THROW, vy))
    if (Math.hypot(node.vx, node.vy) > 0.6) {
      node.role = 'thrown'
    }
    else {
      node.homeX = node.cx
      node.homeY = node.cy
      node.role = 'pile'
      el.style.zIndex = String(node.z)
      setActive(i, false)
    }
    kick()
  }

  function onCancel() {
    downIndex = -1
    const i = dragIndex
    if (i < 0)
      return
    dragIndex = -1
    dragPointer = -1
    const node = nodes[i]!
    node.role = 'pile'
    const el = els[i]
    if (el)
      el.style.zIndex = String(node.z)
    setActive(i, false)
    kick()
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || (holder.op < 0 && holder.mtg < 0))
      return
    clear('op')
    clear('mtg')
    lastInputAt = performance.now()
  }

  function onBlur() {
    onCancel()
    onLeave()
  }

  // ------------------------------------------------------------ lifecycle

  onMounted(() => {
    mounted = true
    reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    void build()
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    ro = new ResizeObserver(onResize)
    if (root.value) {
      ro.observe(root.value)
      io = new IntersectionObserver(([entry]) => {
        visible = !!entry?.isIntersecting
      })
      io.observe(root.value)
    }
    const pocket = root.value?.querySelector('[data-tide-pocket]')
    if (pocket)
      ro.observe(pocket)
    startDealing()
  })

  watch(() => [pools().op, pools().mtg], () => {
    if (mounted)
      swapCards()
  })

  onBeforeUnmount(() => {
    mounted = false
    if (raf)
      cancelAnimationFrame(raf)
    if (dealTimer)
      clearInterval(dealTimer)
    if (resizeTimer)
      clearTimeout(resizeTimer)
    firstDeals.forEach(clearTimeout)
    ro?.disconnect()
    io?.disconnect()
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('blur', onBlur)
  })

  return {
    cards,
    shown,
    clear,
    on: {
      move: onMove,
      leave: onLeave,
      over: onOver,
      out: onOut,
      down: onDown,
      up: onUp,
      cancel: onCancel,
    },
  }
}
