/**
 * The room around the bookcases, one per universe.
 *
 * Magic, an arcanist's library: dark panelling, a circle of runes glowing on
 * the wall, candles on the bookcases, gold dust in the air, a violet haze.
 * One Piece, a ship's cabin: planks and nails, portholes on the sea, ropes
 * along the bookcases, a swinging lantern, light off the water on the walls.
 *
 * Kept cheap: the moving lights follow the camera (two of them, whatever the
 * number of bookcases), flames and dust are one point cloud each, ropes one
 * merged tube. `update` animates it while the scene is awake.
 */
import type * as Three from 'three'
import type { Quality, Universe } from './library'

/** Three.js addons the room may need (none yet). */
export type AmbianceKit = Record<string, unknown>

export interface Ambiance {
  /** Advance the room's life; `camX` is where the camera looks. */
  update: (t: number, dt: number, camX: number) => boolean
  dispose: () => void
}

interface Span { width: number, height: number, depth: number, cases: number, caseWidth: number, gap: number }

function canvasTexture(THREE: typeof Three, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): Three.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d')!)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** A soft round spot, for flames and dust. */
function glowTexture(THREE: typeof Three, inner: string, outer: string): Three.CanvasTexture {
  return canvasTexture(THREE, 64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, inner)
    grad.addColorStop(0.35, outer)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
  })
}

/** Dust (or spray) drifting in front of the bookcases. */
function dust(THREE: typeof Three, span: Span, count: number, color: number, size: number) {
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * (span.width + 6) - 3
    pos[i * 3 + 1] = Math.random() * (span.height + 1)
    pos[i * 3 + 2] = Math.random() * 3.2 + 0.4
    seed[i] = Math.random() * 100
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const tex = glowTexture(THREE, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.25)')
  const mat = new THREE.PointsMaterial({ map: tex, color, size, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })
  const points = new THREE.Points(geo, mat)
  const update = (t: number, dt: number) => {
    for (let i = 0; i < count; i++) {
      const s = seed[i]!
      pos[i * 3] = pos[i * 3]! + Math.sin(t * 0.2 + s) * dt * 0.05
      const y = pos[i * 3 + 1]! + (Math.sin(t * 0.13 + s * 1.7) * 0.5 + 0.35) * dt * 0.06
      pos[i * 3 + 1] = y > span.height + 1 ? -0.2 : y
    }
    geo.attributes.position!.needsUpdate = true
    mat.opacity = 0.65 + Math.sin(t * 0.8) * 0.1
  }
  return { points, update, dispose: () => [geo, mat, tex].forEach(d => d.dispose()) }
}

export function buildAmbiance(THREE: typeof Three, _kit: AmbianceKit, scene: Three.Scene, span: Span, universe: Universe, quality: Quality): Ambiance {
  return universe === 'mtg' ? arcanist(THREE, scene, span, quality) : cabin(THREE, scene, span, quality)
}

// ---- Magic: an arcanist's library -----------------------------------------

function arcanist(THREE: typeof Three, scene: Three.Scene, span: Span, quality: Quality): Ambiance {
  const disposables: { dispose: () => void }[] = []
  const high = quality === 'high'
  const cx = span.width / 2
  const back = -span.depth / 2 - 0.25

  // Dark wood panelling, a warm pool of light in the middle.
  const wallTex = canvasTexture(THREE, 512, 512, (g) => {
    g.fillStyle = '#1b1116'
    g.fillRect(0, 0, 512, 512)
    for (let x = 0; x < 512; x += 128) {
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(x, 0, 4, 512)
      g.strokeStyle = 'rgba(120,80,60,0.12)'
      g.strokeRect(x + 16, 24, 96, 200)
      g.strokeRect(x + 16, 260, 96, 228)
    }
  })
  wallTex.wrapS = THREE.RepeatWrapping
  wallTex.repeat.set((span.width + 30) / 6, 1)
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(span.width + 30, span.height + 10), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }))
  wall.position.set(cx, span.height / 2 + 1.5, back)
  wall.receiveShadow = true
  const floorTex = canvasTexture(THREE, 256, 256, (g) => {
    g.fillStyle = '#140c0a'
    g.fillRect(0, 0, 256, 256)
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = 'rgba(80,50,30,0.25)'
      g.fillRect(0, y, 256, 2)
    }
  })
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping
  floorTex.repeat.set((span.width + 30) / 3, 5)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(span.width + 30, 14), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(cx, -0.3, 4)
  floor.receiveShadow = true
  scene.add(wall, floor)
  disposables.push(wallTex, floorTex, wall.geometry, wall.material as Three.Material, floor.geometry, floor.material as Three.Material)

  // A circle of runes on the wall between the bookcases, turning slowly.
  const runes = canvasTexture(THREE, 512, 512, (g) => {
    g.translate(256, 256)
    g.strokeStyle = 'rgba(190,140,255,0.9)'
    g.shadowColor = 'rgba(170,110,255,1)'
    g.shadowBlur = 18
    for (const r of [230, 200, 120]) {
      g.lineWidth = r === 200 ? 2 : 3
      g.beginPath()
      g.arc(0, 0, r, 0, Math.PI * 2)
      g.stroke()
    }
    g.fillStyle = 'rgba(210,180,255,0.95)'
    g.font = '28px serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'
    for (let i = 0; i < 24; i++) {
      g.save()
      g.rotate((i / 24) * Math.PI * 2)
      g.fillText(glyphs[i % glyphs.length]!, 0, -215)
      g.restore()
    }
    for (let i = 0; i < 6; i++) {
      g.beginPath()
      const a = (i / 6) * Math.PI * 2
      g.moveTo(Math.cos(a) * 120, Math.sin(a) * 120)
      g.lineTo(Math.cos(a + Math.PI * 2 / 3) * 120, Math.sin(a + Math.PI * 2 / 3) * 120)
      g.stroke()
    }
  })
  const runeMat = new THREE.MeshBasicMaterial({ map: runes, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
  const circles: Three.Mesh[] = []
  // One between each pair of bookcases, one on each outer side.
  const spots = [-span.gap - 1.2, ...Array.from({ length: Math.max(0, span.cases - 1) }, (_, i) => (i + 1) * (span.caseWidth + span.gap) - span.gap / 2), span.width + span.gap + 1.2]
  const runeGeo = new THREE.PlaneGeometry(2.4, 2.4)
  for (const x of spots) {
    const m = new THREE.Mesh(runeGeo, runeMat)
    m.position.set(x, span.height * 0.62, back + 0.02)
    scene.add(m)
    circles.push(m)
  }
  disposables.push(runes, runeMat, runeGeo)

  // Candles on each bookcase's cornice: wax merged, flames one point cloud.
  const candles: Three.BufferGeometry[] = []
  const flamePos: number[] = []
  for (let c = 0; c < span.cases; c++) {
    const x0 = c * (span.caseWidth + span.gap)
    for (const [fx, h] of [[0.12, 0.34], [0.2, 0.22], [0.86, 0.28]] as const) {
      const g = new THREE.CylinderGeometry(0.05, 0.055, h, 12)
      const x = x0 + span.caseWidth * fx
      g.translate(x, span.height + 0.1 + h / 2, 0.15)
      candles.push(g)
      flamePos.push(x, span.height + 0.1 + h + 0.07, 0.15)
    }
  }
  const wax = new THREE.Mesh(mergeAll(THREE, candles), new THREE.MeshStandardMaterial({ color: 0xE8DCC0, roughness: 0.6, emissive: 0x3A2A10, emissiveIntensity: 0.4 }))
  wax.castShadow = true
  const flameGeo = new THREE.BufferGeometry()
  flameGeo.setAttribute('position', new THREE.Float32BufferAttribute(flamePos, 3))
  const flameTex = glowTexture(THREE, 'rgba(255,245,200,1)', 'rgba(255,150,40,0.55)')
  const flameMat = new THREE.PointsMaterial({ map: flameTex, size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  const flames = new THREE.Points(flameGeo, flameMat)
  scene.add(wax, flames)
  disposables.push(wax.geometry, wax.material as Three.Material, flameGeo, flameTex, flameMat)

  // Candlelight that follows the bookcase in view; a violet glow from the runes.
  const candle = new THREE.PointLight(0xFFB060, high ? 9 : 6, 9, 1.6)
  const arcane = new THREE.PointLight(0x9A6BFF, 3.5, 10, 1.8)
  scene.add(candle, arcane)
  scene.fog = new THREE.FogExp2(0x160C16, 0.022)

  const motes = dust(THREE, span, high ? 420 : 140, 0xFFD58A, 0.045)
  scene.add(motes.points)
  disposables.push(motes)

  return {
    update(t, dt, camX) {
      const flicker = 1 + Math.sin(t * 11) * 0.06 + Math.sin(t * 23.7) * 0.04 + Math.sin(t * 5.3) * 0.05
      candle.intensity = (high ? 9 : 6) * flicker
      candle.position.set(camX, span.height + 0.9, 1.4)
      arcane.position.set(camX + 3.2, span.height * 0.6, back + 0.8)
      flameMat.size = 0.5 * flicker
      circles.forEach((m, i) => (m.rotation.z = t * 0.05 * (i % 2 ? -1 : 1)))
      runeMat.opacity = 0.45 + Math.sin(t * 0.9) * 0.12
      motes.update(t, dt)
      return true
    },
    dispose: () => disposables.forEach(d => d.dispose()),
  }
}

// ---- One Piece: a ship's cabin ---------------------------------------------

function cabin(THREE: typeof Three, scene: Three.Scene, span: Span, quality: Quality): Ambiance {
  const disposables: { dispose: () => void }[] = []
  const high = quality === 'high'
  const cx = span.width / 2
  const back = -span.depth / 2 - 0.25

  // Planks and their nails.
  const wallTex = canvasTexture(THREE, 512, 512, (g) => {
    for (let x = 0; x < 512; x += 64) {
      const tone = 110 + ((x / 64) % 3) * 12
      g.fillStyle = `rgb(${tone},${tone * 0.66},${tone * 0.4})`
      g.fillRect(x, 0, 64, 512)
      g.fillStyle = 'rgba(40,20,8,0.55)'
      g.fillRect(x, 0, 3, 512)
      for (let i = 0; i < 30; i++) {
        g.fillStyle = `rgba(60,30,10,${0.08 + Math.random() * 0.12})`
        g.fillRect(x + 6 + Math.random() * 52, Math.random() * 512, 1 + Math.random() * 2, 20 + Math.random() * 60)
      }
      for (const y of [40, 470]) {
        g.fillStyle = 'rgba(30,25,20,0.9)'
        g.beginPath()
        g.arc(x + 32, y, 4, 0, Math.PI * 2)
        g.fill()
      }
    }
  })
  wallTex.wrapS = THREE.RepeatWrapping
  wallTex.repeat.set((span.width + 30) / 5, 1)
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(span.width + 30, span.height + 10), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 }))
  wall.position.set(cx, span.height / 2 + 1.5, back)
  wall.receiveShadow = true
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(span.width + 30, 14), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8, color: 0xC8A080 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(cx, -0.3, 4)
  floor.receiveShadow = true
  scene.add(wall, floor)
  disposables.push(wallTex, wall.geometry, wall.material as Three.Material, floor.geometry, floor.material as Three.Material)

  // Portholes on the sea, between the bookcases and on each side.
  const sea = canvasTexture(THREE, 256, 256, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 256)
    sky.addColorStop(0, '#9fd5f0')
    sky.addColorStop(0.55, '#e8f4f8')
    sky.addColorStop(0.56, '#2f8fb8')
    sky.addColorStop(1, '#0d4d6e')
    g.fillStyle = sky
    g.fillRect(0, 0, 256, 256)
    g.strokeStyle = 'rgba(255,255,255,0.4)'
    for (let y = 150; y < 256; y += 14) {
      g.beginPath()
      for (let x = 0; x <= 256; x += 16)
        g.lineTo(x, y + Math.sin(x / 20 + y) * 3)
      g.stroke()
    }
  })
  const glassMat = new THREE.MeshBasicMaterial({ map: sea })
  const brass = new THREE.MeshStandardMaterial({ color: 0xC9A04A, metalness: 1, roughness: 0.3 })
  const holeGeo = new THREE.CircleGeometry(0.55, 32)
  const rimGeo = new THREE.TorusGeometry(0.58, 0.07, 12, 40)
  const spots = [-span.gap - 1.1, ...Array.from({ length: Math.max(0, span.cases - 1) }, (_, i) => (i + 1) * (span.caseWidth + span.gap) - span.gap / 2), span.width + span.gap + 1.1]
  for (const x of spots) {
    const glass = new THREE.Mesh(holeGeo, glassMat)
    const rim = new THREE.Mesh(rimGeo, brass)
    glass.position.set(x, span.height * 0.65, back + 0.02)
    rim.position.set(x, span.height * 0.65, back + 0.05)
    scene.add(glass, rim)
  }
  disposables.push(sea, glassMat, brass, holeGeo, rimGeo)

  // Ropes sagging along each bookcase's cornice, one merged tube.
  const ropeTex = canvasTexture(THREE, 64, 16, (g) => {
    g.fillStyle = '#b8935a'
    g.fillRect(0, 0, 64, 16)
    g.strokeStyle = 'rgba(80,55,25,0.8)'
    g.lineWidth = 3
    for (let x = -16; x < 80; x += 8) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x + 16, 16)
      g.stroke()
    }
  })
  ropeTex.wrapS = THREE.RepeatWrapping
  ropeTex.repeat.set(30, 1)
  const ropes: Three.BufferGeometry[] = []
  for (let c = 0; c < span.cases; c++) {
    const x0 = c * (span.caseWidth + span.gap)
    const y = span.height + 0.02
    const z = span.depth / 2 + 0.3
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x0 - 0.05, y, z),
      new THREE.Vector3(x0 + span.caseWidth * 0.25, y - 0.22, z + 0.02),
      new THREE.Vector3(x0 + span.caseWidth * 0.5, y - 0.05, z),
      new THREE.Vector3(x0 + span.caseWidth * 0.75, y - 0.22, z + 0.02),
      new THREE.Vector3(x0 + span.caseWidth + 0.05, y, z),
    ])
    ropes.push(new THREE.TubeGeometry(curve, 48, 0.035, 8, false))
  }
  const rope = new THREE.Mesh(mergeAll(THREE, ropes), new THREE.MeshStandardMaterial({ map: ropeTex, roughness: 0.9 }))
  rope.castShadow = true
  scene.add(rope)
  disposables.push(ropeTex, rope.geometry, rope.material as Three.Material)

  // The lantern, hanging in front of the bookcase in view, swinging a little.
  const lantern = new THREE.Group()
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2B2420, metalness: 0.6, roughness: 0.5 })
  const glow = new THREE.MeshStandardMaterial({ color: 0xFFD28A, emissive: 0xFFB050, emissiveIntensity: 2.2 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), glow)
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.12, 4), frameMat)
  cap.position.y = 0.21
  cap.rotation.y = Math.PI / 4
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.2, 6), frameMat)
  chain.position.y = 0.87
  body.position.y = 0
  const hang = new THREE.Group()
  hang.add(body, cap, chain)
  hang.position.y = -1.47
  lantern.add(hang)
  const light = new THREE.PointLight(0xFFB86B, high ? 10 : 7, 10, 1.5)
  light.position.y = -1.47
  lantern.add(light)
  scene.add(lantern)
  disposables.push(frameMat, glow, body.geometry, cap.geometry, chain.geometry)

  // Light off the water, drifting on the wall.
  const caustic = canvasTexture(THREE, 256, 256, (g) => {
    g.fillStyle = '#000'
    g.fillRect(0, 0, 256, 256)
    g.strokeStyle = 'rgba(140,210,255,0.5)'
    g.lineWidth = 1.2
    for (let i = 0; i < 18; i++) {
      g.beginPath()
      const y = Math.random() * 256
      g.moveTo(0, y)
      for (let x = 0; x <= 256; x += 16)
        g.lineTo(x, y + Math.sin(x / 24 + i) * 10)
      g.stroke()
    }
  })
  caustic.colorSpace = THREE.NoColorSpace
  caustic.wrapS = caustic.wrapT = THREE.RepeatWrapping
  caustic.repeat.set((span.width + 30) / 7, (span.height + 10) / 7)
  const causticMat = new THREE.MeshBasicMaterial({ map: caustic, transparent: true, opacity: high ? 0.07 : 0.05, blending: THREE.AdditiveBlending, depthWrite: false })
  const water = new THREE.Mesh(new THREE.PlaneGeometry(span.width + 30, span.height + 10), causticMat)
  water.position.set(cx, span.height / 2 + 1.5, back + 0.01)
  scene.add(water)
  disposables.push(caustic, causticMat, water.geometry)
  scene.fog = new THREE.FogExp2(0x3A2818, 0.018)

  const spray = dust(THREE, span, high ? 220 : 80, 0xFFF1D6, 0.04)
  scene.add(spray.points)
  disposables.push(spray)

  return {
    update(t, dt, camX) {
      // Hanging in front of the top shelf, to the right.
      lantern.position.set(camX + span.caseWidth * 0.36, span.height + 0.95, span.depth / 2 + 0.75)
      lantern.rotation.z = Math.sin(t * 0.9) * 0.08
      lantern.rotation.x = Math.sin(t * 0.7 + 1) * 0.05
      light.intensity = (high ? 10 : 7) * (1 + Math.sin(t * 7) * 0.03)
      caustic.offset.set(t * 0.02, Math.sin(t * 0.3) * 0.05)
      spray.update(t, dt)
      return true
    },
    dispose: () => disposables.forEach(d => d.dispose()),
  }
}

/** Geometries into one (no addon needed for plain attributes). */
function mergeAll(THREE: typeof Three, geos: Three.BufferGeometry[]): Three.BufferGeometry {
  const parts = geos.map(g => (g.index ? g.toNonIndexed() : g))
  const names = ['position', 'normal', 'uv'] as const
  const out = new THREE.BufferGeometry()
  for (const name of names) {
    const arrays = parts.map(g => g.getAttribute(name) as Three.BufferAttribute)
    const size = arrays[0]!.itemSize
    const total = arrays.reduce((n, a) => n + a.count * size, 0)
    const data = new Float32Array(total)
    let off = 0
    for (const a of arrays) {
      data.set(a.array as Float32Array, off)
      off += a.count * size
    }
    out.setAttribute(name, new THREE.BufferAttribute(data, size))
  }
  geos.forEach(g => g.dispose())
  parts.forEach(g => g.dispose())
  return out
}
