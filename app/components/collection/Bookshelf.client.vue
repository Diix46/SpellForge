<script setup lang="ts">
import type * as Three from 'three'
import type { SetProgress } from '#shared/collection'
import type { GameId } from '#shared/game'
import { onBeforeUnmount, onMounted, ref } from 'vue'

// The collection's binders on a bookcase, spines out: a colour per set, its
// symbol, name and a gauge of how far it goes. Hovered, a binder slides out;
// clicked, it is pulled off the shelf, turned to face you, its cover swings
// open on the set's art — and the binder page takes over. Three.js, loaded
// with this component only; a drag (or the wheel) runs along a long shelf.
const props = defineProps<{ sets: SetProgress[], game: GameId }>()

const { t } = useLocale()
const router = useRouter()
const host = ref<HTMLDivElement | null>(null)
const tip = ref<{ set: SetProgress, x: number, y: number } | null>(null)
const leaving = ref(false)
const ready = ref(false)
const failed = ref(false)

// Binder and bookcase sizes, in scene units.
const W = 0.34
const H = 1.36
const D = 1.05
const PITCH = 0.4
const ROW = 1.78
const BOARD = 0.08

let stop = () => {}

/** A set's colour: a hue of its own, deep enough for light lettering. */
function hueOf(code: string): number {
  let h = 0
  for (const ch of code)
    h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

/** The spine: colour, symbol, name upright, code, and the progress gauge. */
function paintSpine(THREE: typeof Three, set: SetProgress): Three.CanvasTexture {
  const c = document.createElement('canvas')
  // Drawn at 128×512, rendered at twice that: sharp lettering.
  c.width = 256
  c.height = 1024
  const g = c.getContext('2d')!
  const hue = hueOf(set.code)
  const done = set.owned >= set.total
  const draw = (symbol?: HTMLImageElement) => {
    g.setTransform(2, 0, 0, 2, 0, 0)
    g.textAlign = 'left'
    const grad = g.createLinearGradient(0, 0, 128, 0)
    grad.addColorStop(0, `hsl(${hue} 45% 18%)`)
    grad.addColorStop(0.5, `hsl(${hue} 50% 30%)`)
    grad.addColorStop(1, `hsl(${hue} 45% 16%)`)
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 512)
    // Stitched bands.
    g.fillStyle = done ? '#e9c46a' : 'rgba(255,255,255,0.18)'
    g.fillRect(0, 22, 128, 4)
    g.fillRect(0, 486, 128, 4)
    if (symbol) {
      // The symbol in white: drawn, then its shape filled.
      const s = document.createElement('canvas')
      s.width = 72
      s.height = 72
      const sg = s.getContext('2d')!
      sg.drawImage(symbol, 0, 0, 72, 72)
      sg.globalCompositeOperation = 'source-in'
      sg.fillStyle = done ? '#f0d27a' : '#f4efe6'
      sg.fillRect(0, 0, 72, 72)
      g.drawImage(s, 28, 40)
    }
    else {
      g.fillStyle = '#f4efe6'
      g.font = '700 24px ui-monospace, monospace'
      g.textAlign = 'center'
      g.fillText(set.code.toUpperCase().slice(0, 5), 64, 84)
    }
    // The name, reading bottom to top as on a real spine.
    g.save()
    g.translate(72, 410)
    g.rotate(-Math.PI / 2)
    g.textAlign = 'left'
    g.fillStyle = '#f4efe6'
    let size = 30
    g.font = `600 ${size}px system-ui, sans-serif`
    while (g.measureText(set.name).width > 280 && size > 16) {
      size -= 2
      g.font = `600 ${size}px system-ui, sans-serif`
    }
    const name = g.measureText(set.name).width > 280 ? `${set.name.slice(0, 22)}…` : set.name
    g.fillText(name, 0, 0)
    g.restore()
    // Code and gauge at the foot.
    g.fillStyle = 'rgba(244,239,230,0.75)'
    g.font = '600 18px ui-monospace, monospace'
    g.textAlign = 'center'
    g.fillText(set.code.toUpperCase().slice(0, 6), 64, 446)
    g.fillStyle = 'rgba(0,0,0,0.35)'
    g.fillRect(20, 460, 88, 10)
    g.fillStyle = done ? '#f0d27a' : '#7fd1a8'
    g.fillRect(20, 460, 88 * Math.min(1, set.total ? set.owned / set.total : 0), 10)
  }
  draw()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  if (set.icon) {
    const img = new Image()
    img.onload = () => {
      draw(img)
      tex.needsUpdate = true
    }
    img.src = set.icon
  }
  return tex
}

/** Wood, a few grains on a warm brown. */
function paintWood(THREE: typeof Three): Three.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#6e4a2c'
  g.fillRect(0, 0, 512, 64)
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(${40 + Math.random() * 30},${24 + Math.random() * 16},${10},${0.15 + Math.random() * 0.2})`
    g.lineWidth = 1 + Math.random() * 2
    g.beginPath()
    const y = Math.random() * 64
    g.moveTo(0, y)
    g.bezierCurveTo(170, y + Math.random() * 8 - 4, 340, y + Math.random() * 8 - 4, 512, y)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  return tex
}

/** The first page inside, seen as the cover opens: nine sleeved pockets. */
function paintPage(THREE: typeof Three): Three.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 384
  c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#f3eee3'
  g.fillRect(0, 0, 384, 512)
  const pw = 100
  const ph = 140
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 3; k++) {
      const x = 30 + k * (pw + 12)
      const y = 34 + r * (ph + 16)
      const grad = g.createLinearGradient(x, y, x + pw, y + ph)
      grad.addColorStop(0, '#e2dccf')
      grad.addColorStop(0.5, '#d6cfbf')
      grad.addColorStop(1, '#e6e0d4')
      g.fillStyle = grad
      g.fillRect(x, y, pw, ph)
      g.strokeStyle = 'rgba(0,0,0,0.12)'
      g.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1)
      g.fillStyle = 'rgba(255,255,255,0.35)'
      g.fillRect(x + 6, y + 4, 10, ph - 8)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

onMounted(async () => {
  const el = host.value
  if (!el)
    return
  let THREE: typeof Three
  try {
    THREE = await import('three')
  }
  catch {
    failed.value = true
    return
  }
  const renderer = (() => {
    try {
      return new THREE.WebGLRenderer({ antialias: true, alpha: true })
    }
    catch {
      return null
    }
  })()
  if (!renderer) {
    failed.value = true
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  el.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
  scene.add(new THREE.HemisphereLight(0xFFF4E0, 0x3A2A1E, 1.1))
  const key = new THREE.DirectionalLight(0xFFE8C8, 1.6)
  key.position.set(3, 6, 8)
  scene.add(key)
  const rim = new THREE.PointLight(0xFFC98A, 8, 12)
  rim.position.set(0, 2.5, 3)
  scene.add(rim)

  // ---- Layout: up to three shelves, as many binders across as it takes ----
  const n = props.sets.length
  // A shelf for a few binders, three for many; the bookcase as wide as the
  // view at least, so the wood fills it.
  const rows = n <= 10 ? 1 : n <= 26 ? 2 : 3
  const tanHalf = Math.tan((34 * Math.PI) / 360)
  const aspect = el.clientWidth / Math.max(1, el.clientHeight)
  const seen = 2 * tanHalf * Math.max((rows * ROW + 0.6) / 2 / tanHalf, 4.2) * aspect
  const cols = Math.ceil(n / rows)
  const length = Math.max(cols * PITCH + 0.5, seen - 0.4)
  // The binders stand in the middle of their shelves.
  const x0 = (length - 0.5 - cols * PITCH) / 2
  const wood = paintWood(THREE)
  wood.repeat.set(length / 2, 1)
  const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 })
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3B2718, roughness: 0.9 })
  const disposables: { dispose: () => void }[] = [wood, woodMat, darkWood]
  const top = rows * ROW
  const back = new THREE.Mesh(new THREE.PlaneGeometry(length + 0.3, top + 0.3), darkWood)
  back.position.set(length / 2 - 0.25, top / 2 - 0.1, -D / 2 - 0.08)
  scene.add(back)
  for (let r = 0; r <= rows; r++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(length + 0.3, BOARD, D + 0.25), woodMat)
    board.position.set(length / 2 - 0.25, r * ROW - BOARD / 2, 0.02)
    scene.add(board)
  }
  for (const x of [-0.4, length - 0.1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.1, top + 0.08, D + 0.25), woodMat)
    side.position.set(x, top / 2 - 0.04, 0.02)
    scene.add(side)
  }

  // ---- Binders ----
  interface Binder { set: SetProgress, group: Three.Group, cover: Three.Group, coverFace: Three.MeshStandardMaterial, home: Three.Vector3, out: number, artLoaded: boolean }
  const binders: Binder[] = []
  const pickable: Three.Object3D[] = []
  const pagesMat = new THREE.MeshStandardMaterial({ color: 0xF3EEE3, roughness: 0.95 })
  const pageTex = paintPage(THREE)
  const pageMat = new THREE.MeshStandardMaterial({ map: pageTex, roughness: 0.9 })
  disposables.push(pagesMat, pageTex, pageMat)
  props.sets.forEach((set, i) => {
    const row = Math.floor(i / cols)
    const col = i % cols
    const hue = hueOf(set.code)
    const color = new THREE.Color(`hsl(${hue}, 45%, 24%)`)
    const coverMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
    const spine = paintSpine(THREE, set)
    const spineMat = new THREE.MeshStandardMaterial({ map: spine, roughness: 0.5 })
    const coverFace = new THREE.MeshStandardMaterial({ color, roughness: 0.5 })
    disposables.push(coverMat, spine, spineMat, coverFace)

    const group = new THREE.Group()
    // The page block; its +x face is the first page, under the cover.
    const pages = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, H * 0.95, D * 0.95), [pageMat, pagesMat, pagesMat, pagesMat, pagesMat, pagesMat])
    const backCover = new THREE.Mesh(new THREE.BoxGeometry(0.03, H, D), coverMat)
    backCover.position.x = -W / 2 + 0.015
    // The spine's face (+z) carries its painting.
    const spineMesh = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.03), [coverMat, coverMat, coverMat, coverMat, spineMat, coverMat])
    spineMesh.position.z = D / 2 - 0.015
    // The front cover hinges on the spine's edge; its outer face (+x) gets the art.
    const cover = new THREE.Group()
    cover.position.set(W / 2 - 0.015, 0, D / 2)
    const coverMesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, H, D), [coverFace, coverMat, coverMat, coverMat, coverMat, coverMat])
    coverMesh.position.z = -D / 2
    cover.add(coverMesh)
    group.add(pages, backCover, spineMesh, cover)
    // The first binders on the top shelf, left to right.
    const home = new THREE.Vector3(x0 + col * PITCH, (rows - 1 - row) * ROW + H / 2 + 0.005, 0)
    group.position.copy(home)
    // A slight lean now and then, as on a real shelf.
    if ((i * 7) % 11 === 3)
      group.rotation.z = 0.035
    scene.add(group)
    for (const m of [pages, backCover, spineMesh, coverMesh]) {
      m.userData.binder = i
      pickable.push(m)
    }
    binders.push({ set, group, cover, coverFace, home, out: 0, artLoaded: false })
  })

  const loader = new THREE.TextureLoader()
  function loadArt(b: Binder) {
    if (b.artLoaded || !b.set.art)
      return
    b.artLoaded = true
    loader.load(b.set.art, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      // The art cropped to the cover's shape (portrait).
      const img = tex.image as HTMLImageElement
      const want = D / H
      const have = img.width / img.height
      if (have > want) {
        tex.repeat.set(want / have, 1)
        tex.offset.set((1 - want / have) / 2, 0)
      }
      else {
        tex.repeat.set(1, have / want)
        tex.offset.set(0, (1 - have / want) / 2)
      }
      b.coverFace.map = tex
      b.coverFace.color.set(0xFFFFFF)
      b.coverFace.needsUpdate = true
      disposables.push(tex)
    })
  }

  // ---- Camera: framing the shelves, running along them ----
  let camX = 0
  let minX = 0
  let maxX = 0
  const camY = top / 2 - 0.05
  let camZ = 7
  function frame() {
    const w = el!.clientWidth
    const h = el!.clientHeight
    renderer!.setSize(w, h)
    camera.aspect = w / h
    // Far enough to see every shelf; the width decides how much shelf shows.
    const fitH = (top + 0.6) / 2 / Math.tan((camera.fov * Math.PI) / 360)
    camZ = Math.max(fitH, 4.2)
    const halfW = Math.tan((camera.fov * Math.PI) / 360) * camZ * camera.aspect
    minX = Math.min(length / 2 - 0.25, halfW - 0.5)
    maxX = Math.max(length / 2 - 0.25, length - halfW - 0.2)
    camX = Math.min(maxX, Math.max(minX, camX || minX))
    camera.updateProjectionMatrix()
  }
  frame()
  const ro = new ResizeObserver(frame)
  ro.observe(el)

  // ---- Pointer: hover slides a binder out, a drag runs along, a click opens ----
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let hover = -1
  let opening: { b: Binder, t0: number } | null = null
  let dragging: { x: number, camX: number, moved: boolean } | null = null
  function pick(e: PointerEvent): number {
    const r = renderer!.domElement.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(pickable, false)[0]
    return hit ? hit.object.userData.binder as number : -1
  }
  function onMove(e: PointerEvent) {
    if (opening)
      return
    if (dragging) {
      const dx = e.clientX - dragging.x
      if (Math.abs(dx) > 4)
        dragging.moved = true
      camX = Math.min(maxX, Math.max(minX, dragging.camX - dx * (camZ / el!.clientHeight) * 0.9))
      tip.value = null
      return
    }
    hover = pick(e)
    const r = el!.getBoundingClientRect()
    if (hover >= 0) {
      loadArt(binders[hover]!)
      tip.value = { set: binders[hover]!.set, x: e.clientX - r.left, y: e.clientY - r.top }
    }
    else {
      tip.value = null
    }
    el!.style.cursor = hover >= 0 ? 'pointer' : (maxX > minX ? 'grab' : 'default')
  }
  function onDown(e: PointerEvent) {
    if (opening)
      return
    dragging = { x: e.clientX, camX, moved: false }
    renderer!.domElement.setPointerCapture(e.pointerId)
  }
  function onUp(e: PointerEvent) {
    const wasDrag = dragging?.moved
    dragging = null
    if (opening || wasDrag)
      return
    const i = pick(e)
    if (i >= 0)
      open(binders[i]!)
  }
  function onLeave() {
    hover = -1
    tip.value = null
  }
  function onWheel(e: WheelEvent) {
    if (maxX <= minX)
      return
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0)
    if (!d)
      return
    e.preventDefault()
    camX = Math.min(maxX, Math.max(minX, camX + d * 0.004))
  }
  const canvas = renderer.domElement
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  // Development only: ?slowmo slows the opening down, to look at it.
  const pace = import.meta.dev && new URLSearchParams(location.search).has('slowmo') ? 0.15 : 1
  const target = (b: Binder) => collectionPath(props.game, `/sets/${b.set.code}`)
  function open(b: Binder) {
    tip.value = null
    if (reduced) {
      void router.push(target(b))
      return
    }
    loadArt(b)
    opening = { b, t0: performance.now() }
  }

  // ---- The loop ----
  const clock = new THREE.Clock()
  let raf = 0
  let visible = true
  const io = new IntersectionObserver(([entry]) => (visible = !!entry?.isIntersecting))
  io.observe(el)
  const from = new THREE.Vector3()
  function loop() {
    raf = requestAnimationFrame(loop)
    if (!visible || document.hidden)
      return
    const dt = Math.min(clock.getDelta(), 0.05)
    // Camera glides to where the drag or the wheel put it.
    camera.position.x += (camX - camera.position.x) * Math.min(1, dt * 10)
    camera.position.y = camY
    camera.position.z = camZ
    camera.lookAt(camera.position.x, camY, 0)
    binders.forEach((b, i) => {
      if (opening?.b === b)
        return
      const want = i === hover ? 0.32 : 0
      b.out += (want - b.out) * Math.min(1, dt * 12)
      b.group.position.z = b.home.z + b.out
    })
    if (opening) {
      const { b } = opening
      const s = ((performance.now() - opening.t0) / 1000) * pace
      // 1. Pulled off the shelf.
      const p1 = ease(Math.min(1, s / 0.35))
      if (s < 0.36)
        from.set(b.home.x, b.home.y, b.home.z + 0.32 + p1 * 0.8)
      b.group.position.copy(from)
      // 2. Brought in front of you, turned cover-out.
      const p2 = ease(Math.min(1, Math.max(0, (s - 0.3) / 0.6)))
      const dest = new THREE.Vector3(camera.position.x + D * 0.3, camY, camZ - 2.1)
      b.group.position.lerpVectors(from, dest, p2)
      b.group.rotation.set(0, -Math.PI / 2 * p2, 0)
      // 3. The cover swings open.
      const p3 = ease(Math.min(1, Math.max(0, (s - 0.85) / 0.55)))
      b.cover.rotation.y = -1.95 * p3
      // 4. Into the binder.
      if (s > 1.3 && !leaving.value) {
        leaving.value = true
        setTimeout(() => void router.push(target(b)), 250)
      }
    }
    renderer!.render(scene, camera)
  }
  loop()
  ready.value = true

  stop = () => {
    cancelAnimationFrame(raf)
    io.disconnect()
    ro.disconnect()
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointerleave', onLeave)
    canvas.removeEventListener('wheel', onWheel)
    scene.traverse((o) => {
      if ((o as Three.Mesh).geometry)
        (o as Three.Mesh).geometry.dispose()
    })
    disposables.forEach(d => d.dispose())
    renderer!.dispose()
    canvas.remove()
  }
})
onBeforeUnmount(() => stop())

const pct = (s: SetProgress) => (s.total ? Math.floor((s.owned / s.total) * 100) : 0)
</script>

<template>
  <div class="shelf" :class="{ leaving }">
    <div ref="host" class="stage" :aria-label="t('collection.shelf.label')" role="img" />
    <div v-if="!ready && !failed" class="loading" role="status">
      <UIcon name="i-lucide-loader-circle" class="h-6 w-6 animate-spin" />
    </div>
    <p v-if="failed" class="loading">
      {{ t('collection.shelf.unavailable') }}
    </p>
    <div v-if="tip" class="tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
      <b>{{ tip.set.name }}</b>
      <span>{{ tip.set.owned }} / {{ tip.set.total }} · {{ pct(tip.set) }}%</span>
    </div>
    <p v-if="ready" class="hint">
      <UIcon name="i-lucide-mouse-pointer-click" class="h-3.5 w-3.5" /> {{ t('collection.shelf.hint') }}
    </p>
  </div>
</template>

<style scoped>
.shelf {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-xl);
  background: radial-gradient(120% 90% at 50% 10%, #4a3526, #1f150e 70%);
  box-shadow:
    inset 0 0 60px rgba(0, 0, 0, 0.55),
    var(--shadow-elev-2);
}
.stage {
  height: clamp(340px, 52vh, 560px);
  touch-action: pan-y;
}
.stage :deep(canvas) {
  display: block;
}
.loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: rgba(255, 240, 220, 0.8);
}
.tip {
  position: absolute;
  z-index: 2;
  display: grid;
  gap: 2px;
  padding: 7px 11px;
  border-radius: var(--radius-md);
  background: rgba(20, 14, 10, 0.88);
  font-size: 12px;
  white-space: nowrap;
  color: #f4efe6;
  transform: translate(14px, -110%);
  pointer-events: none;
}
.tip b {
  font-size: 13px;
}
.tip span {
  font-family: var(--font-mono);
  opacity: 0.8;
}
.hint {
  position: absolute;
  right: 14px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: rgba(255, 240, 220, 0.7);
  pointer-events: none;
}
/* Entering the binder: the room fades as it opens. */
.shelf::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--color-surface-1, #fff);
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}
.shelf.leaving::after {
  opacity: 1;
}
</style>
