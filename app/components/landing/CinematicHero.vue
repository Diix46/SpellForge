<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { useAuthOverlay } from '~/composables/useAuthOverlay'
import { useLocale } from '~/composables/useLocale'

// Interactive full-screen "card tide" hero: dozens of real Magic cards dumped
// across the viewport in messy overlap, with a translucent glass panel floating
// in a carved-out reading pocket at center. The pile is ALIVE — it breathes (pure
// CSS), drifts in depth as you move the cursor (parallax), shoves away from the
// cursor, lifts on hover, opens a full close-up on click (and auto-cycles a
// featured card when idle), and lets you grab & fling cards with light inertia.
// The hero accent reacts to the focused card's mana.
//
// Architecture (from a judged design study): hybrid-zones spine.
//  - Two layers per card: outer .card carries the JS physics transform; inner
//    .card-inner carries the pure-CSS breathe keyframe — they never collide.
//  - State (S[]) is plain, NON-reactive: mutating 50 nodes/frame through Vue
//    reactivity would thrash. Only ready/focused/accent are refs.
//  - ONE reference-counted rAF: it runs only while something is happening
//    (pointer active, a card thrown/picked). Idle = no rAF; CSS keeps it alive.
//  - Per frame: read inputs once, then one write pass; dirty-skip at-rest cards;
//    integer-quantised transform strings; will-change only on active cards.

interface LandingCard { name: string, image: string, artist: string, colors: string[] }

type Role = 'pile' | 'zoned' | 'dragging' | 'thrown'

interface Node {
  card: LandingCard
  layer: 0 | 1 | 2
  // resting pose (px / deg), computed once at layout
  homeX: number
  homeY: number
  homeRot: number
  baseScale: number
  z: number
  // current animated values
  cx: number
  cy: number
  crot: number
  cscale: number
  // throw velocity
  vx: number
  vy: number
  // repulsion offset (eased separately from the spring)
  px: number
  py: number
  tpx: number // repulsion target x
  tpy: number // repulsion target y
  role: Role
  zone: -1 | 0 | 1 // which showcase slot this card occupies (-1 none, 0 left, 1 right)
  hovered: boolean // pointer is over this pile card (discreet lift)
  lastT: string // last written transform string (dirty-skip)
  active: boolean // will-change toggle
}

const { t, locale, setLocale } = useLocale()
const { show: openAuth } = useAuthOverlay()

// Accent RGB per WUBRG (brand mana colours); multicolour/colourless → warm gold.
const COLOR_RGB: Record<string, string> = {
  w: '233,205,120',
  u: '79,168,232',
  b: '150,120,200',
  r: '232,88,68',
  g: '56,184,131',
}
function accentFor(colors: string[]): string {
  const c = colors.find(x => COLOR_RGB[x])
  return c ? COLOR_RGB[c]! : '210,180,120'
}
// One WUBRG letter → its own pip colour (for the showcase card's colour dots).
function accentForPip(color: string): string {
  return COLOR_RGB[color] ?? '170,170,180'
}

// ---- Reactive (UI-only) state ----
const ready = ref(false)
// The card whose name/artist the caption shows + whose mana drives the accent:
// the most-recently-showcased card (clicked or auto-dealt into a zone).
const focused = ref<LandingCard | null>(null)
const accent = computed(() => focused.value ? accentFor(focused.value.colors) : '210,180,120')

// Rendered once by v-for; never mutated per-frame.
const cards = ref<LandingCard[]>([])

// Template refs (cached to plain locals in onMounted for the hot path). The ref
// KEYS must not collide with the plain engine locals below, hence the *Ref suffix.
const sectionRef = useTemplateRef<HTMLElement>('sectionRef')
const pileRef = useTemplateRef<HTMLElement>('pileRef')

// ---- Plain (non-reactive) engine state ----
let S: Node[] = []
const els: (HTMLElement | null)[] = []
const inners: (HTMLElement | null)[] = []
let sectionEl: HTMLElement | null = null
let pileEl: HTMLElement | null = null

let pointerInside = false
let reduce = false
let raf = 0
let reasons = 0
let last = 0
let mx = 0
let my = 0
// Normalised pointer offset from viewport centre (-1..1), eased toward the raw
// pointer each frame so the parallax glides instead of snapping. Drives the
// depth-parallax: the whole pile drifts opposite the cursor, deeper layers less,
// nearer layers more — so the tide reads as 3D and "changeant" as you move.
let pdx = 0
let pdy = 0
let pdxTarget = 0
let pdyTarget = 0
let parallaxReason = false // holds one loop reason while the depth glides back
let cx0 = 0 // viewport centre
let cy0 = 0
let cw = 180 // card width px
let ch = 252 // card height px
let barH = 76 // top-bar height px (measured once at layout, used to centre zone cards on the panel)
// Glass-panel left/right edges in px (measured once at layout). The two showcase
// corridors are [0..panelLeft] and [panelRight..vw]; a card centres in its corridor.
let panelLeft = 0
let panelRight = 0
let gridCols = 6 // grid columns (solved to cover the viewport)
let gridRows = 6 // grid rows

// Showcase ZONES: two fixed slots, left (0) and right (1) of the panel. A clicked
// or auto-dealt card flies to a free slot — ALWAYS the same spot, ALWAYS on top of
// the whole pile — and re-clicking it sends it home. zoneSlots holds the node index
// occupying each slot (-1 = empty); nextSlot decides which side the next card takes.
const zoneSlots: number[] = [-1, -1] // node index in slot 0 (left) / 1 (right); -1 = empty
let nextSlot: 0 | 1 = 1 // start on the right (matches the old alternating feel)
let dragId = -1
let grabDX = 0
let grabDY = 0
let grabWasZoned = false // the grabbed card was showcased (so a tap sends it home)
// tap detection (a quick press that barely moves toggles the card into/out of a zone)
let downX = 0
let downY = 0
let downT = 0
let dealTimer: ReturnType<typeof setInterval> | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null
let lastInputAt = 0
let io: IntersectionObserver | null = null
let visible = true
// ring buffer of recent drag samples for throw velocity
const ring: Array<{ x: number, y: number, t: number }> = []

// Physics constants
const K_POS = 0.12
const DAMP = 0.86
const K_ROT = 0.1
const REP_R = 190 // repulsion radius px
const REP_R2 = REP_R * REP_R
const REP_DEADZONE = 70 // cards whose centre is within this of the cursor don't flee
const REP_DEADZONE2 = REP_DEADZONE * REP_DEADZONE
const PUSH = 64 // max repulsion offset px
const FRICTION = 0.93
const MAX_THROW = 32 // px/frame clamp
// Depth-parallax: max px the pointer can shift each layer (0=deepest … 2=nearest).
// Nearer cards travel further → the pile gains apparent depth on cursor move.
const PARALLAX_LAYER = [10, 22, 38]
const PARALLAX_EASE = 0.06 // how fast pdx/pdy glide toward the pointer target
const ROTATE_DEAL_MS = 6000 // auto-deal cadence (fills a free zone when idle)
const DEAL_IDLE_MS = 3000 // how long with no input before auto-deal resumes
// Reserved z-tiers (never reordered per-frame): pile = layer*100+jitter (≤299),
// a showcased card rides at 9000, a grabbed/thrown card above that at 9500.
const Z_ZONE = 9000
const Z_DRAG = 9500

// ---------- helpers ----------
function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}
// Solve a grid that ALWAYS covers the whole viewport with a dense overlapping
// pile, while keeping the card COUNT under a perf cap. We grow the card size
// until cols*rows fits the cap — so a huge/ultrawide screen gets fewer, bigger
// cards but is still fully tiled (no bald gaps). Returns the grid + card width.
const OVERLAP = 0.52 // cell pitch as a fraction of the card (lower = more overlap)
const OVERSCAN = 1.18 // grid extends 9% past each edge so cards bleed off-screen
function solveGrid(vw: number, vh: number) {
  const cap = vw <= 720 ? 40 : vw <= 1100 ? 90 : 170
  const minW = vw <= 720 ? Math.max(108, vw * 0.28) : 150
  const maxW = vw <= 720 ? 200 : 300
  let cw = minW
  let cols = 2
  let rows = 2
  // grow the card (→ bigger pitch → fewer cells) until under the cap
  for (let guard = 0; guard < 40; guard++) {
    const pitchX = cw * OVERLAP
    const pitchY = cw * 1.4 * OVERLAP
    cols = Math.max(2, Math.ceil((vw * OVERSCAN) / pitchX))
    rows = Math.max(2, Math.ceil((vh * OVERSCAN) / pitchY))
    if (cols * rows <= cap || cw >= maxW)
      break
    cw = Math.min(maxW, cw * 1.08)
  }
  return { cols, rows, cw: Math.min(maxW, cw), count: cols * rows }
}

// Fixed pose for a showcase slot (0 = left, 1 = right of the panel). DETERMINISTIC:
// the same viewport always yields the same centre + scale, so a card sent here lands
// at the exact same spot every time — no "random" placement. Returns the top-left
// offset (cards are absolute top:0 left:0, moved by transform) + the target scale.
function zoneTarget(side: number): { tx: number, ty: number, tscale: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const dir = side === 1 ? 1 : -1
  // Each showcase corridor is the gap between the panel and a screen edge:
  // left = [0 .. panelLeft], right = [panelRight .. vw]. A card CENTRED in its
  // corridor gets equal margin to the panel AND to the edge on its own side.
  // Size is driven by the SMALLER corridor so both cards stay the same scale.
  const leftCorridor = panelLeft
  const rightCorridor = vw - panelRight
  const minCorridor = Math.min(leftCorridor, rightCorridor)
  // a comfortable size, but never wider than the corridor (minus margins) nor taller
  const maxByW = (minCorridor - 48) / cw
  const maxByH = (vh - 120) / ch
  const tscale = Math.max(0.9, Math.min(vw <= 720 ? 1.4 : 1.55, maxByW, maxByH))
  const halfCardH = (ch * tscale) / 2
  const fitsBeside = minCorridor > cw * 0.9 + 48

  // Vertical: centre on the GLASS PANEL (cy0 + barH/2), measured once at layout so the
  // cards line up with the title instead of floating above it.
  const panelCy = cy0 + barH / 2

  let centreX: number
  let centreY: number
  if (fitsBeside) {
    // dead-centre of this side's corridor → equal gap to the panel and to the edge
    centreX = side === 0 ? leftCorridor / 2 : panelRight + rightCorridor / 2
    centreY = panelCy
  }
  else {
    // too narrow (mobile) → stack the two slots above/below the title instead
    centreX = cx0
    centreY = panelCy - halfCardH - 12 + dir * (halfCardH + 12)
  }
  centreY = Math.max(halfCardH + 88, Math.min(vh - halfCardH - 24, centreY))
  return { tx: centreX - cw / 2, ty: centreY - ch / 2, tscale }
}

type VueRef = Element | ComponentPublicInstance | null
function setElRef(i: number) {
  return (e: VueRef) => {
    els[i] = (e as HTMLElement) ?? null
  }
}
function setInnerRef(i: number) {
  return (e: VueRef) => {
    inners[i] = (e as HTMLElement) ?? null
  }
}

// Reference-counted rAF: start only on 0→1, stop only on 1→0.
function requestLoop() {
  if (reduce)
    return
  if (reasons++ === 0) {
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }
}
function releaseLoop() {
  if (reasons > 0 && --reasons === 0 && raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
}
// Kick the loop for a SELF-LIMITING animation (a card springing to/from a zone):
// it starts the rAF if idle but holds NO persistent reason, so the tick's
// self-stop reclaims it once the motion settles — no leaked reason, no battery drain.
function kickLoop() {
  if (reduce)
    return
  if (!raf) {
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }
}

// ---------- layout / scatter ----------
function layout() {
  if (!import.meta.client)
    return
  const vw = window.innerWidth
  const vh = window.innerHeight
  cx0 = vw / 2
  cy0 = vh / 2
  // measure the top bar + glass panel ONCE here (not per-frame) so zone cards centre
  // on the panel and each card centres in its own corridor (equal margins per side)
  const barEl = sectionEl?.querySelector<HTMLElement>('.bar')
  barH = barEl ? barEl.getBoundingClientRect().height : 76
  const glassEl = sectionEl?.querySelector<HTMLElement>('.glass')
  if (glassEl) {
    const g = glassEl.getBoundingClientRect()
    panelLeft = g.left
    panelRight = g.right
  }
  else {
    // fallback: assume a centred panel of the design max-width
    const hp = Math.min(600, vw * 0.92) / 2
    panelLeft = cx0 - hp
    panelRight = cx0 + hp
  }
  if (pileEl) {
    pileEl.style.setProperty('--cw', `${cw}px`)
    pileEl.style.setProperty('--ch', `${ch}px`)
  }

  const n = S.length
  // The grid (solved at mount/resize) ALWAYS spans the full viewport with overscan
  // so the pile covers everything — cells smaller than the card → heavy overlap.
  const cols = gridCols
  const spanX = vw * OVERSCAN
  const spanY = vh * OVERSCAN
  const offX = -vw * (OVERSCAN - 1) / 2
  const offY = -vh * (OVERSCAN - 1) / 2
  const pitchX = spanX / cols
  const pitchY = spanY / gridRows

  // keep-out ellipse (the carved reading pocket the glass panel sits in)
  const isMobile = vw <= 720
  const rx = isMobile ? vw * 0.46 : Math.min(360, vw * 0.26)
  const ry = isMobile ? vh * 0.24 : Math.min(230, vh * 0.27)

  for (let i = 0; i < n; i++) {
    const node = S[i]!
    const gc = i % cols
    const gr = Math.floor(i / cols)
    // cell centre + jitter so the grid dissolves into a messy dump (kept under
    // half a pitch so coverage stays gap-free even with overlap)
    let x = offX + (gc + 0.5) * pitchX + rand(-0.3, 0.3) * pitchX
    let y = offY + (gr + 0.5) * pitchY + rand(-0.3, 0.3) * pitchY
    // diagonal "drift current" so the pile reads as flowing, not uniform noise
    x += Math.sin((gr + gc) * 0.6) * 6

    // push out of the reading pocket (carves the clean centre)
    const ndx = (x - cx0) / rx
    const ndy = (y - cy0) / ry
    const er = Math.hypot(ndx, ndy)
    if (er < 1) {
      const ang = Math.atan2(y - cy0, x - cx0)
      const margin = rand(12, 30)
      x = cx0 + Math.cos(ang) * (rx + margin)
      y = cy0 + Math.sin(ang) * (ry + margin)
    }

    // depth from distance-to-centre blended with randomness
    const maxDist = Math.hypot(vw, vh) / 2
    const dist = Math.hypot(x - cx0, y - cy0) / maxDist
    const depth = Math.min(1, Math.max(0, dist * 0.7 + Math.random() * 0.3))
    const layer: 0 | 1 | 2 = depth < 0.34 ? 0 : depth < 0.67 ? 1 : 2
    const baseScale = layer === 0 ? 0.82 : layer === 1 ? 0.94 : 1.06
    // wider rotation for edge cards
    const edge = er > 1.4 ? 6 : 0
    const homeRot = rand(-20 - edge, 20 + edge)

    // home is the top-left offset (cards are absolute top:0 left:0, moved by transform)
    node.layer = layer
    node.homeX = x - cw / 2
    node.homeY = y - ch / 2
    node.homeRot = homeRot
    node.baseScale = baseScale
    node.z = layer * 100 + (i % 90)
    // Don't yank a showcased card back into the pile on a resize/relayout: keep its
    // zone + role, just refresh its home so it springs to the recomputed zone target.
    const showcased = node.role === 'zoned'
    if (!showcased) {
      node.cx = node.homeX
      node.cy = node.homeY
      node.crot = homeRot
      node.cscale = baseScale
      node.role = 'pile'
      node.zone = -1
    }
    node.vx = 0
    node.vy = 0
    node.px = 0
    node.py = 0
    node.tpx = 0
    node.tpy = 0
    node.active = showcased
    node.lastT = ''

    // z-index is owned imperatively by the engine (the template no longer binds it,
    // so a non-reactive S[i].z can't be clobbered by Vue re-patching the style):
    // pile cards keep their depth z; a showcased card already set its own 9000+ tier.
    const el = els[i]
    if (el && !showcased)
      el.style.zIndex = String(node.z)

    // breathe vars (set once on the inner layer)
    const inner = inners[i]
    if (inner) {
      inner.style.setProperty('--bd', `${rand(7, 13).toFixed(2)}s`)
      inner.style.setProperty('--bdl', `${rand(-6, 0).toFixed(2)}s`)
    }
    writeNode(node, el)
  }
}

function writeNode(node: Node, el: HTMLElement | null | undefined) {
  if (!el)
    return
  // Depth-parallax: shift the pile opposite the cursor, deeper layers less. Only
  // resting pile cards parallax — a picked/dragged/thrown card owns its own pose.
  const dl = node.role === 'pile' ? PARALLAX_LAYER[node.layer]! : 0
  const qx = (node.cx + node.px - pdx * dl) | 0
  const qy = (node.cy + node.py - pdy * dl) | 0
  const t = `translate3d(${qx}px,${qy}px,0) rotate(${node.crot.toFixed(1)}deg) scale(${node.cscale.toFixed(3)})`
  if (t !== node.lastT) {
    el.style.transform = t
    node.lastT = t
  }
}

function setActive(node: Node, i: number, on: boolean) {
  if (node.active === on)
    return
  node.active = on
  const el = els[i]
  if (el)
    el.style.willChange = on ? 'transform' : ''
}

// ---------- per-frame tick ----------
function tick(now: number) {
  const dt = Math.min((now - last) / 16.667, 2)
  last = now

  // Ease the parallax offset toward the pointer target (read once, per the
  // read-then-write rule). Keep the loop alive while it's still gliding so the
  // pile finishes drifting even when every card is otherwise at rest — after the
  // cursor leaves (releaseLoop) we hold ONE dedicated reason until it settles.
  pdx += (pdxTarget - pdx) * PARALLAX_EASE * dt
  pdy += (pdyTarget - pdy) * PARALLAX_EASE * dt
  const parallaxMoving = Math.abs(pdxTarget - pdx) > 0.0008 || Math.abs(pdyTarget - pdy) > 0.0008
  if (!parallaxMoving && parallaxReason) {
    // depth has settled → release the glide-back reason held by onLeave
    parallaxReason = false
    releaseLoop()
  }
  let anyActive = parallaxMoving
  for (let i = 0; i < S.length; i++) {
    const node = S[i]!
    const el = els[i]
    if (!el)
      continue

    if (node.role === 'dragging') {
      // position forced directly to the cursor; nothing to integrate
      anyActive = true
      writeNode(node, el)
      continue
    }

    // repulsion target: pile cards NEAR the cursor get shoved away in a wave,
    // but the card actually under the cursor (hovered) is left alone so it stays
    // put to be clicked (it rises via the hover lift instead). A small deadzone
    // around the cursor keeps cards stacked right under it from fleeing too.
    node.tpx = 0
    node.tpy = 0
    if (pointerInside && node.role === 'pile' && !node.hovered) {
      const ncx = node.cx + cw / 2
      const ncy = node.cy + ch / 2
      const ddx = ncx - mx
      const ddy = ncy - my
      const d2 = ddx * ddx + ddy * ddy
      if (d2 < REP_R2 && d2 > REP_DEADZONE2) {
        const d = Math.sqrt(d2)
        const f = (1 - d2 / REP_R2) * PUSH * (0.5 + node.layer * 0.35)
        node.tpx = (ddx / d) * f
        node.tpy = (ddy / d) * f
        anyActive = true
      }
    }

    // ease repulsion offset toward its target (springs back when target → 0)
    node.px += (node.tpx - node.px) * 0.18 * dt
    node.py += (node.tpy - node.py) * 0.18 * dt

    if (node.role === 'thrown') {
      node.cx += node.vx
      node.cy += node.vy
      node.vx *= FRICTION
      node.vy *= FRICTION
      // keep it loosely on screen
      node.cx = Math.max(-cw, Math.min(window.innerWidth - cw * 0.2, node.cx))
      node.cy = Math.max(-ch, Math.min(window.innerHeight - ch * 0.2, node.cy))
      if (Math.hypot(node.vx, node.vy) < 0.4) {
        // settle AMONG the others where it landed: this becomes its new home
        node.homeX = node.cx
        node.homeY = node.cy
        node.role = 'pile'
        setActive(node, i, false)
        releaseLoop()
      }
      else {
        anyActive = true
      }
      writeNode(node, el)
      continue
    }

    // pile + zoned: critically-damped spring toward target pose
    let tx = node.homeX
    let ty = node.homeY
    let trot = node.homeRot
    let tscale = node.baseScale
    if (node.role === 'zoned' && node.zone >= 0) {
      // a showcased card springs to its FIXED slot beside the panel (same spot
      // every time), straightened and enlarged — geometry lives in zoneTarget()
      const z = zoneTarget(node.zone)
      tx = z.tx
      ty = z.ty
      trot = 0
      tscale = z.tscale
      anyActive = true
    }
    else if (node.hovered) {
      // discreet hover lift (a click sends it to a showcase zone); rise a touch,
      // straighten slightly, grow a little — stays in place in the pile.
      ty = node.homeY - 14
      trot = node.homeRot * 0.6
      tscale = node.baseScale * 1.12
      anyActive = true
    }

    const dx = tx - node.cx
    const dy = ty - node.cy
    const dr = trot - node.crot
    const ds = tscale - node.cscale
    node.vx = (node.vx + dx * K_POS) * DAMP
    node.vy = (node.vy + dy * K_POS) * DAMP
    node.cx += node.vx * dt
    node.cy += node.vy * dt
    node.crot += dr * K_ROT * dt
    node.cscale += ds * 0.12 * dt

    // A zoned card that has reached its slot is at rest like any settled card: the
    // loop may idle (battery) and the card simply holds its last transform. Only
    // genuine motion keeps the loop alive.
    const moving = Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4 || Math.abs(node.px - node.tpx) > 0.4 || Math.abs(node.py - node.tpy) > 0.4 || Math.abs(dr) > 0.2 || Math.abs(ds) > 0.003
    if (moving)
      anyActive = true

    writeNode(node, el)
  }

  // self-stop when fully settled (release the implicit "frame" reason)
  if (!anyActive && reasons <= 1 && !pointerInside) {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    reasons = 0
    return
  }
  raf = requestAnimationFrame(tick)
}

// ---------- pointer: cursor repulsion ----------
function onMove(e: PointerEvent) {
  mx = e.clientX
  my = e.clientY
  // normalised pointer offset from centre (-1..1) → parallax target
  pdxTarget = Math.max(-1, Math.min(1, (mx - cx0) / (cx0 || 1)))
  pdyTarget = Math.max(-1, Math.min(1, (my - cy0) / (cy0 || 1)))
  lastInputAt = performance.now()
  if (!pointerInside) {
    pointerInside = true
    requestLoop()
  }
}
function onLeave() {
  if (!pointerInside)
    return
  pointerInside = false
  // glide the pile back to neutral depth: hold a dedicated loop reason BEFORE
  // releasing the pointer reason, so dropping the pointer can't cancel the rAF
  // mid-glide (the tick releases this reason once the depth has settled).
  pdxTarget = 0
  pdyTarget = 0
  if (!parallaxReason && (Math.abs(pdx) > 0.0008 || Math.abs(pdy) > 0.0008)) {
    parallaxReason = true
    requestLoop()
  }
  for (const node of S) {
    node.tpx = 0
    node.tpy = 0
  }
  releaseLoop()
}

// ---------- showcase zones (send a card to a fixed L/R slot, on top of all) ----------
// Send card i to a specific slot (0 = left, 1 = right). If the slot already holds
// another card, that one is sent home first. Idempotent if i already owns the slot.
function sendToZone(i: number, slot: 0 | 1) {
  const node = S[i]
  if (!node || node.role === 'dragging' || node.role === 'thrown')
    return
  if (node.zone === slot)
    return
  // evict whoever currently holds the target slot
  const occupant = zoneSlots[slot] ?? -1
  if (occupant >= 0 && occupant !== i)
    sendHome(occupant)
  // if this card was showing in the OTHER slot, free that slot too
  if (node.zone >= 0)
    zoneSlots[node.zone] = -1
  zoneSlots[slot] = i
  node.zone = slot
  node.role = 'zoned'
  node.hovered = false
  node.tpx = 0
  node.tpy = 0
  const el = els[i]
  if (el)
    el.style.zIndex = String(Z_ZONE + slot) // right rides just above left
  setActive(node, i, true)
  focused.value = node.card
  nextSlot = slot === 1 ? 0 : 1 // next auto-deal prefers the other side
  kickLoop()
}
// Return a showcased card to the pile (springs back to its home pose).
function sendHome(i: number) {
  const node = S[i]
  if (!node || node.role !== 'zoned')
    return
  if (node.zone >= 0)
    zoneSlots[node.zone] = -1
  node.zone = -1
  node.role = 'pile'
  const el = els[i]
  if (el)
    el.style.zIndex = String(node.z)
  setActive(node, i, false)
  // accent follows whichever card is still showcased, else resets
  const left = zoneSlots[0] ?? -1
  const right = zoneSlots[1] ?? -1
  const other = left >= 0 ? left : right
  focused.value = other >= 0 ? S[other]!.card : null
  kickLoop()
}
// Which slot a new showcase card should take: the preferred (alternating) side if
// free, else the other side if free, else the preferred side (evicting its card).
function chooseSlot(): 0 | 1 {
  const other: 0 | 1 = nextSlot === 1 ? 0 : 1
  if ((zoneSlots[nextSlot] ?? -1) < 0)
    return nextSlot
  if ((zoneSlots[other] ?? -1) < 0)
    return other
  return nextSlot
}
// Click/tap a card: a showcased card goes home; a pile card fills a free slot
// (preferring the alternating side, else evicting the older one).
function toggleZone(i: number) {
  const node = S[i]
  if (!node)
    return
  if (node.role === 'zoned') {
    sendHome(i)
    return
  }
  sendToZone(i, chooseSlot())
}

function startDeal() {
  if (reduce || dealTimer)
    return
  dealTimer = setInterval(() => {
    if (!visible || document.hidden)
      return
    // only when idle (no recent pointer/drag) and not mid-grab
    if (performance.now() - lastInputAt < DEAL_IDLE_MS)
      return
    if (dragId >= 0)
      return
    const candidates: number[] = []
    for (let i = 0; i < S.length; i++) {
      if (S[i]!.role === 'pile')
        candidates.push(i)
    }
    if (!candidates.length)
      return
    sendToZone(candidates[Math.floor(Math.random() * candidates.length)]!, chooseSlot())
  }, ROTATE_DEAL_MS)
}
function stopDeal() {
  if (dealTimer) {
    clearInterval(dealTimer)
    dealTimer = null
  }
}

// ---------- hover lift (a discreet raise; a click sends it to a showcase zone) ----------
function onCardEnter(i: number) {
  if (reduce)
    return
  const node = S[i]
  if (!node || node.role !== 'pile')
    return
  node.hovered = true
  requestLoop()
}
function onCardLeaveHover(i: number) {
  const node = S[i]
  if (node)
    node.hovered = false
}

// ---------- drag & throw ----------
function onCardDown(i: number, e: PointerEvent) {
  if (reduce)
    return
  const node = S[i]
  const el = els[i]
  if (!node || !el)
    return
  lastInputAt = performance.now()
  // grabbing a showcased card frees its slot (drag wins over the zone state).
  // Remember it WAS showcased so a tap (no drag) reads as "send home", not "re-show".
  grabWasZoned = node.zone >= 0
  if (node.zone >= 0) {
    zoneSlots[node.zone] = -1
    node.zone = -1
  }
  el.setPointerCapture?.(e.pointerId)
  el.style.touchAction = 'none'
  dragId = i
  node.role = 'dragging'
  node.vx = 0
  node.vy = 0
  node.tpx = 0
  node.tpy = 0
  el.style.zIndex = String(Z_DRAG)
  setActive(node, i, true)
  grabDX = e.clientX - node.cx
  grabDY = e.clientY - node.cy
  downX = e.clientX
  downY = e.clientY
  downT = performance.now()
  ring.length = 0
  ring.push({ x: e.clientX, y: e.clientY, t: performance.now() })
  requestLoop()
}
function onCardMove(i: number, e: PointerEvent) {
  if (dragId !== i)
    return
  const node = S[i]!
  node.cx = e.clientX - grabDX
  node.cy = e.clientY - grabDY
  lastInputAt = performance.now()
  ring.push({ x: e.clientX, y: e.clientY, t: performance.now() })
  if (ring.length > 5)
    ring.shift()
}
function onCardUp(i: number, e: PointerEvent) {
  if (dragId !== i)
    return
  const node = S[i]!
  const el = els[i]
  el?.releasePointerCapture?.(e.pointerId)
  if (el)
    el.style.touchAction = ''
  dragId = -1

  // TAP (quick press that barely moved) → toggle the card's showcase state instead
  // of throwing it. onCardDown already freed any zone it held + flipped role to
  // 'dragging', so we reset it to pile here, then act on grabWasZoned: a tap on an
  // ALREADY-showcased card sends it home; a tap on a pile card sends it to a slot.
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
  const elapsed = performance.now() - downT
  if (moved < 8 && elapsed < 400) {
    node.role = 'pile'
    node.hovered = false
    if (el)
      el.style.zIndex = String(node.z)
    releaseLoop() // pair the requestLoop in onCardDown
    if (!grabWasZoned)
      toggleZone(i) // pile → showcase slot (sets its own zone/role/z + kickLoop)
    else
      kickLoop() // already sent home above; spring it back, then the loop self-stops
    return
  }

  // throw velocity from the ring buffer (oldest vs newest)
  let vx = 0
  let vy = 0
  if (ring.length >= 2) {
    const a = ring[0]!
    const b = ring[ring.length - 1]!
    const dtMs = b.t - a.t
    // a slow drag then pause is a place-down, not a fling
    if (dtMs > 0 && performance.now() - b.t < 120) {
      vx = ((b.x - a.x) / dtMs) * 16.667
      vy = ((b.y - a.y) / dtMs) * 16.667
    }
  }
  node.vx = Math.max(-MAX_THROW, Math.min(MAX_THROW, vx))
  node.vy = Math.max(-MAX_THROW, Math.min(MAX_THROW, vy))
  if (Math.hypot(node.vx, node.vy) > 0.6) {
    node.role = 'thrown'
    requestLoop() // keep integrating the throw
  }
  else {
    // place-down: settle here
    node.homeX = node.cx
    node.homeY = node.cy
    node.role = 'pile'
    setActive(node, i, false)
  }
  if (el)
    el.style.zIndex = String(node.z)
  releaseLoop() // pair the requestLoop in onCardDown
}
function onCardCancel(i: number) {
  if (dragId !== i)
    return
  const node = S[i]!
  dragId = -1
  node.role = 'pile'
  const el = els[i]
  if (el) {
    el.style.touchAction = ''
    el.style.zIndex = String(node.z)
  }
  setActive(node, i, false)
  releaseLoop()
}

// ---------- resize / visibility ----------
function onResize() {
  if (resizeTimer)
    clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    // Keep the (fixed) card count but re-factor the grid to the new aspect so the
    // pile still spans the whole viewport; recompute card size to keep overlap.
    const vw = window.innerWidth
    const vh = window.innerHeight
    const n = S.length || 1
    gridCols = Math.max(2, Math.round(Math.sqrt(n * (vw / vh))))
    gridRows = Math.max(2, Math.ceil(n / gridCols))
    cw = Math.min(vw <= 720 ? 200 : 300, (vw * OVERSCAN) / gridCols / OVERLAP)
    ch = cw * 1.4
    layout()
    if (reduce)
      return
    requestLoop()
    releaseLoop()
  }, 200)
}
function onIntersect(entries: IntersectionObserverEntry[]) {
  const e = entries[0]
  if (!e)
    return
  visible = e.isIntersecting && e.intersectionRatio > 0.1
}
function onVisibility() {
  if (document.hidden) {
    // park everything; the loop will self-stop next frame
    pointerInside = false
  }
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape')
    return
  // Escape clears the showcase — send any zoned cards back to the pile.
  const left = zoneSlots[0] ?? -1
  const right = zoneSlots[1] ?? -1
  if (left < 0 && right < 0)
    return
  if (right >= 0)
    sendHome(right)
  if (left >= 0)
    sendHome(left)
  lastInputAt = performance.now()
}
function onWindowBlur() {
  // a card stuck to the cursor mid-drag would never release otherwise
  if (dragId >= 0)
    onCardCancel(dragId)
  onLeave()
}

// ---------- reduced-motion static spotlight ----------
function staticSpotlight() {
  // pick one tasteful card as a still spotlight in the pocket
  if (!S.length)
    return
  const i = Math.floor(S.length / 2)
  const node = S[i]!
  node.role = 'zoned' // excludes it from parallax; sits as a still hero spotlight
  node.cx = cx0 - cw / 2
  node.cy = cy0 - ch / 2 - ch * 0.4
  node.crot = 0
  node.cscale = 1.35
  node.z = Z_ZONE
  const el = els[i]
  if (el) {
    el.style.zIndex = String(Z_ZONE)
    writeNode(node, el)
  }
  focused.value = node.card
}

// ---------- load ----------
onMounted(async () => {
  if (!import.meta.client)
    return
  reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  try {
    const { cards: pool } = await $fetch<{ cards: LandingCard[] }>('/api/landing/cards', {
      query: { _: Date.now() },
    })
    const grid = solveGrid(window.innerWidth, window.innerHeight)
    gridCols = grid.cols
    gridRows = grid.rows
    cw = grid.cw
    ch = grid.cw * 1.4
    const n = grid.count
    const base = (pool ?? []).filter(c => c.image).sort(() => Math.random() - 0.5)
    if (!base.length)
      throw new Error('no cards')
    // Repeat from the pool if the viewport needs more cards than we fetched
    // (huge/ultrawide screens) so the tide always covers the whole screen.
    const picked: LandingCard[] = []
    for (let i = 0; i < n; i++)
      picked.push(base[i % base.length]!)
    cards.value = picked
  }
  catch {
    ready.value = false
    return
  }
  if (!cards.value.length)
    return

  S = cards.value.map(card => ({
    card,
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
    zone: -1,
    hovered: false,
    lastT: '',
    active: false,
  }))
  ready.value = true

  await nextTick()
  sectionEl = sectionRef.value
  pileEl = pileRef.value
  layout()

  // Resize reflows the static pile even in reduced-motion (onResize early-returns
  // the rAF when reduce is set), so a rotation/resize doesn't leave a stale layout.
  window.addEventListener('resize', onResize)

  if (reduce) {
    staticSpotlight()
    return
  }

  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('keydown', onKey)
  document.addEventListener('visibilitychange', onVisibility)
  if (sectionEl) {
    io = new IntersectionObserver(onIntersect, { threshold: [0, 0.1, 0.5] })
    io.observe(sectionEl)
  }
  startDeal()
})

onBeforeUnmount(() => {
  if (raf)
    cancelAnimationFrame(raf)
  stopDeal()
  if (resizeTimer)
    clearTimeout(resizeTimer)
  io?.disconnect()
  if (import.meta.client) {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('blur', onWindowBlur)
    window.removeEventListener('keydown', onKey)
    document.removeEventListener('visibilitychange', onVisibility)
  }
})
</script>

<template>
  <section ref="sectionRef" class="pile-hero" :style="{ '--accent': accent }">
    <!-- ===== Card pile (decorative) ===== -->
    <div ref="pileRef" class="pile" aria-hidden="true">
      <div
        v-for="(c, i) in cards"
        :key="c.name + i"
        :ref="setElRef(i)"
        class="card"
        @pointerenter="onCardEnter(i)"
        @pointerleave="onCardLeaveHover(i)"
        @pointerdown="onCardDown(i, $event)"
        @pointermove="onCardMove(i, $event)"
        @pointerup="onCardUp(i, $event)"
        @pointercancel="onCardCancel(i)"
      >
        <div :ref="setInnerRef(i)" class="card-inner">
          <img :src="c.image" alt="" loading="eager" decoding="async" draggable="false">
        </div>
      </div>
    </div>

    <!-- ===== Scrim over the reading pocket ===== -->
    <div class="scrim" aria-hidden="true" />
    <div class="wash" aria-hidden="true" />

    <!-- ===== Top bar ===== -->
    <header class="bar">
      <AppLogo />
      <div class="bar-right">
        <div class="lang">
          <button :class="{ on: locale === 'fr' }" aria-label="Français" @click="setLocale('fr')">
            FR
          </button>
          <button :class="{ on: locale === 'en' }" aria-label="English" @click="setLocale('en')">
            EN
          </button>
        </div>
        <button type="button" class="ghost" @click="openAuth('login')">
          {{ t('auth.login') }}
        </button>
        <button type="button" class="cta cta--sm" @click="openAuth('register')">
          {{ t('landing.ctaPrimary') }}
        </button>
      </div>
    </header>

    <!-- ===== Glass hero panel (the readable pocket) ===== -->
    <div class="stage">
      <!-- showcase caption: the most-recently-showcased card's name + colours +
           artist (decorative; the card itself sits in a fixed L/R zone) -->
      <Transition name="meta">
        <div v-if="focused" :key="focused.name" class="closeup" aria-hidden="true">
          <span class="closeup-name">{{ focused.name }}</span>
          <span class="closeup-sub">
            <span v-if="focused.colors.length" class="closeup-pips">
              <span
                v-for="col in focused.colors"
                :key="col"
                class="closeup-pip"
                :style="{ background: `rgb(${accentForPip(col)})` }"
              />
            </span>
            <span v-if="focused.artist" class="closeup-art">{{ t('landing.illus') }} · {{ focused.artist }}</span>
          </span>
        </div>
      </Transition>

      <div class="glass">
        <span class="eyebrow">
          <span class="dot" />{{ t('landing.badge') }}
        </span>
        <h1 class="title">
          <span class="l1">{{ t('landing.title1') }}</span>
          <span class="l2">{{ t('landing.title2') }}</span>
        </h1>
        <p class="sub">
          {{ t('landing.subtitle') }}
        </p>
        <div class="actions">
          <button type="button" class="cta" @click="openAuth('register')">
            <UIcon name="i-lucide-sparkles" class="h-[18px] w-[18px]" />
            {{ t('landing.ctaPrimary') }}
            <UIcon name="i-lucide-arrow-right" class="h-[18px] w-[18px] arr" />
          </button>
          <button type="button" class="ghost ghost--lg" @click="openAuth('login')">
            {{ t('landing.ctaSecondary') }}
          </button>
        </div>
      </div>
    </div>

    <div class="grain" aria-hidden="true" />
    <div class="scroll" aria-hidden="true">
      <UIcon name="i-lucide-chevron-down" />
    </div>
  </section>
</template>

<style scoped>
.pile-hero {
  position: relative;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  isolation: isolate;
  background: #08070a;
  color: #f4f1ea;
}

/* ===== Pile ===== */
.pile {
  position: absolute;
  inset: 0;
  z-index: 0;
  /* The pile wrapper spans the screen; its empty gaps must not swallow clicks
     (cards re-enable pointer-events). Depth ordering is via each card's z-index. */
  pointer-events: none;
}
.card {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--cw, 180px);
  height: var(--ch, 252px);
  transform-origin: center;
  backface-visibility: hidden;
  cursor: grab;
  pointer-events: auto;
}
.card:active {
  cursor: grabbing;
}
.card-inner {
  width: 100%;
  height: 100%;
  transform-origin: center;
  animation: breathe var(--bd, 9s) var(--bdl, 0s) ease-in-out infinite alternate;
}
.card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4.8% / 3.5%;
  box-shadow:
    0 1px 1px rgba(0, 0, 0, 0.5),
    0 14px 34px -12px rgba(0, 0, 0, 0.8);
  -webkit-user-drag: none;
  user-select: none;
}
@keyframes breathe {
  to {
    transform: translate3d(0, -5px, 0) rotate(1.2deg) scale(1.012);
  }
}

/* ===== Scrim + accent wash over the centre pocket ===== */
.scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    radial-gradient(58% 50% at 50% 46%, rgba(8, 7, 10, 0.86) 0%, rgba(8, 7, 10, 0.4) 55%, transparent 78%),
    linear-gradient(0deg, rgba(8, 7, 10, 0.85) 0%, transparent 26%),
    linear-gradient(180deg, rgba(8, 7, 10, 0.7) 0%, transparent 18%);
}
.wash {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: radial-gradient(46% 36% at 50% 44%, rgba(var(--accent), 0.16), transparent 72%);
  mix-blend-mode: screen;
  transition: background 1.2s ease;
}
.grain {
  position: absolute;
  inset: 0;
  z-index: 4;
  opacity: 0.4;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
}

/* ===== Top bar ===== */
.bar {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px clamp(20px, 5vw, 64px);
}
.bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.lang {
  display: inline-flex;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  overflow: hidden;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.lang button {
  padding: 5px 11px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: rgba(244, 241, 234, 0.55);
  transition:
    color 0.2s,
    background 0.2s;
}
.lang button.on {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
}
.ghost {
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 500;
  color: #f4f1ea;
  border-radius: 10px;
  /* discreet glass plate so the button reads over the busy card pile */
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(12, 11, 14, 0.5);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  transition:
    background 0.2s,
    border-color 0.2s;
}
.ghost:hover {
  background: rgba(12, 11, 14, 0.7);
  border-color: rgba(255, 255, 255, 0.28);
}
.ghost--lg {
  padding: 15px 24px;
  font-size: 15px;
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.04);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.ghost--lg:hover {
  border-color: rgba(var(--accent), 0.7);
  background: rgba(var(--accent), 0.12);
}

/* ===== Stage (centres the glass panel in the pocket) ===== */
.stage {
  position: relative;
  z-index: 5;
  flex: 1;
  display: grid;
  place-items: center;
  padding: 0 clamp(20px, 5vw, 64px);
  pointer-events: none; /* let pile cards behind stay grabbable; panel re-enables */
}
.closeup {
  position: absolute;
  bottom: clamp(20px, 5vh, 48px);
  right: clamp(20px, 4vw, 56px);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  text-align: right;
  /* discreet glass plate so the caption reads over the busy pile */
  padding: 8px 16px;
  border-radius: 12px;
  background: rgba(12, 11, 14, 0.55);
  border: 1px solid rgba(var(--accent), 0.22);
  -webkit-backdrop-filter: blur(10px) saturate(1.1);
  backdrop-filter: blur(10px) saturate(1.1);
  box-shadow:
    0 8px 28px -12px rgba(0, 0, 0, 0.85),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: border-color 1.2s ease;
}
.closeup-name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: rgba(244, 241, 234, 0.95);
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.8);
}
.closeup-sub {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.closeup-pips {
  display: inline-flex;
  gap: 4px;
}
.closeup-pip {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  box-shadow: 0 0 6px 0 rgba(0, 0, 0, 0.6);
}
.closeup-art {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgba(244, 241, 234, 0.62);
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.8);
}
.meta-enter-active,
.meta-leave-active {
  transition:
    opacity 0.4s ease,
    transform 0.4s ease;
}
.meta-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.meta-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.glass {
  pointer-events: auto;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: min(600px, 92vw);
  padding: clamp(28px, 4vw, 48px) clamp(24px, 4vw, 52px);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(12, 11, 14, 0.55);
  -webkit-backdrop-filter: blur(16px) saturate(1.1);
  backdrop-filter: blur(16px) saturate(1.1);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04),
    0 40px 90px -30px rgba(0, 0, 0, 0.9),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  margin-bottom: 22px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(244, 241, 234, 0.8);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
}
.eyebrow .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(var(--accent));
  box-shadow: 0 0 10px 1px rgb(var(--accent));
  transition:
    background 1.2s ease,
    box-shadow 1.2s ease;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2.4rem, 6.5vw, 4.6rem);
  line-height: 0.96;
  letter-spacing: -0.045em;
  text-wrap: balance;
}
.title .l1 {
  display: block;
  color: #f6f3ec;
}
.title .l2 {
  display: block;
  background: linear-gradient(100deg, rgb(var(--accent)), #fff 92%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  transition: background 1.2s ease;
}
.sub {
  max-width: 44ch;
  margin: 22px 0 0;
  font-size: clamp(0.98rem, 1.4vw, 1.12rem);
  line-height: 1.6;
  color: rgba(244, 241, 234, 0.82);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 14px;
  margin-top: 32px;
}
.cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 15px 26px;
  font-size: 15.5px;
  font-weight: 600;
  color: #0a0a0b;
  border-radius: 12px;
  background: rgb(var(--accent));
  box-shadow:
    0 0 0 1px rgba(var(--accent), 0.5),
    0 16px 44px -12px rgba(var(--accent), 0.8);
  transition:
    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.25s,
    background 1.2s ease;
}
.cta:hover {
  transform: translateY(-3px);
  box-shadow:
    0 0 0 1px rgba(var(--accent), 0.7),
    0 22px 56px -12px rgba(var(--accent), 1);
}
.cta .arr {
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.cta:hover .arr {
  transform: translateX(4px);
}
.cta--sm {
  padding: 9px 18px;
  font-size: 14px;
  border-radius: 10px;
  box-shadow:
    0 0 0 1px rgba(var(--accent), 0.4),
    0 8px 22px -8px rgba(var(--accent), 0.7);
}
.cta--sm:hover {
  transform: translateY(-2px);
}

.scroll {
  position: absolute;
  z-index: 5;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(244, 241, 234, 0.5);
  font-size: 20px;
  animation: bob 2s ease-in-out infinite;
}
@keyframes bob {
  0%,
  100% {
    transform: translate(-50%, 0);
    opacity: 0.5;
  }
  50% {
    transform: translate(-50%, 7px);
    opacity: 1;
  }
}

@media (max-width: 720px) {
  /* Hide ONLY the top-bar login (cramped on phones); the panel's secondary
     "I already have an account" CTA (.ghost--lg) must stay so mobile users can
     still reach login directly. */
  .bar .ghost {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .card-inner {
    animation: none;
  }
  .scroll {
    animation: none;
  }
}
</style>
