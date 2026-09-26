/**
 * The 3D library: bookcases side by side, a shelf per family, the binders on
 * them. Built for few draw calls — each bookcase is one merged frame, one
 * instanced mesh of binders and one of spines (their labels from a single
 * atlas) — and drawn only when something moves: camera, a binder sliding
 * out, the opening, a short while of ambient life after the last touch.
 *
 * Three.js comes in as a parameter: this module holds no import of it, the
 * page loads it (and this) only when the library is shown.
 */
import type * as Three from 'three'
import type { Ambiance, AmbianceKit } from './ambiance'
import type { Bookcase, ShelfBinder } from './layout'
import { SpineAtlas } from './atlas'
import { hueOf } from './layout'

export type Universe = 'mtg' | 'optcg'
export type Quality = 'high' | 'low'

export interface LibraryEvents {
  /** The binder under the pointer (or selected by touch), and where on screen. */
  hover: (binder: ShelfBinder | null, at: { x: number, y: number } | null) => void
  /** The bookcase in front of the camera. */
  caseChange: (index: number) => void
  /** A binder was chosen (click, second tap): the page opens it, with its pages. */
  pick: (binder: ShelfBinder) => void
  /** A binder was opened: its screen rectangle, open, and a still of the scene. */
  opened: (binder: ShelfBinder, open: { rect: DOMRect, still: string }) => void
}

export interface LibraryOptions extends LibraryEvents {
  universe: Universe
  quality: Quality
  freshLabel: string
  perShelf: number
  reducedMotion: boolean
  /** Modules loaded with Three.js. */
  kit: AmbianceKit & {
    RoundedBoxGeometry: new (w: number, h: number, d: number, segments?: number, radius?: number) => Three.BufferGeometry
    mergeGeometries: (g: Three.BufferGeometry[]) => Three.BufferGeometry | null
    RoomEnvironment: new () => Three.Scene
  }
  buildAmbiance: (THREE: typeof Three, kit: AmbianceKit, scene: Three.Scene, span: { width: number, height: number, depth: number }, universe: Universe, quality: Quality) => Ambiance
}

// Sizes, in scene units: a binder, the step between two, a shelf's height.
export const DIM = { W: 0.36, H: 1.4, D: 1.1, PITCH: 0.42, ROW: 1.86, BOARD: 0.09, SIDE: 0.14, GAP: 1.1, MARGIN: 0.22 }

interface Placed {
  binder: ShelfBinder
  caseIndex: number
  slot: number
  base: Three.Vector3
  lean: number
  out: number
  target: number
}

interface BuiltCase {
  width: number
  x: number
  bodies: Three.InstancedMesh
  spines: Three.InstancedMesh
  atlas: SpineAtlas
  placed: Placed[]
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

export class Library {
  private readonly renderer: Three.WebGLRenderer
  private readonly scene: Three.Scene
  private readonly camera: Three.PerspectiveCamera
  private readonly ray: Three.Raycaster
  private readonly ndc: Three.Vector2
  private readonly disposables: { dispose: () => void }[] = []
  private readonly cases: BuiltCase[] = []
  private ambiance: Ambiance | null = null
  private key: Three.DirectionalLight | null = null

  private width = 1
  private height = 1
  private caseIndex = 0
  private camX = 0
  private camTargetX = 0
  private camZ = 8
  private camY = 3
  private parallax = { x: 0, y: 0, tx: 0, ty: 0 }
  private hovered: Placed | null = null
  private raf = 0
  private needs = true
  private lifeUntil = 0
  private shadowDirty = true
  private visible = true
  private opening: { p: Placed, t0: number, rig: Three.Group, cover: Three.Object3D, done: boolean } | null = null
  private drag: { x: number, camX: number, moved: boolean, pointer: string } | null = null
  private readonly io: IntersectionObserver
  private readonly ro: ResizeObserver
  /** Draw calls of the last frame, frames drawn since the start (measures). */
  stats = { calls: 0, frames: 0 }

  constructor(private readonly THREE: typeof Three, private readonly host: HTMLElement, private readonly opts: LibraryOptions) {
    const high = opts.quality === 'high'
    this.renderer = new THREE.WebGLRenderer({ antialias: high, alpha: true, powerPreference: high ? 'high-performance' : 'low-power' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1.4))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = high ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
    // Shadows are drawn when something moved, not every frame.
    this.renderer.shadowMap.autoUpdate = false
    host.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80)
    this.ray = new THREE.Raycaster()
    this.ndc = new THREE.Vector2()

    // Soft, even reflections for everything (built once).
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const env = pmrem.fromScene(new opts.kit.RoomEnvironment(), 0.04).texture
    this.scene.environment = env
    this.scene.environmentIntensity = 0.35
    pmrem.dispose()
    this.disposables.push(env)

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.io = new IntersectionObserver(([e]) => {
      this.visible = !!e?.isIntersecting
      if (this.visible)
        this.invalidate()
    })
    this.io.observe(host)
    const canvas = this.renderer.domElement
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointerleave', this.onLeave)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  // ---- Building ----------------------------------------------------------

  /** Put up the bookcases and their binders (once; `refresh` repaints spines). */
  build(layout: readonly Bookcase[], images: (b: ShelfBinder) => { icon: HTMLImageElement | null, art: HTMLImageElement | null }): void {
    const { THREE } = this
    const { W, H, D, PITCH, ROW, BOARD, SIDE, GAP, MARGIN } = DIM
    const per = this.opts.perShelf
    const inner = per * PITCH + MARGIN * 2
    const caseW = inner + SIDE * 2
    const rows = Math.max(1, ...layout.map(c => c.rows.length))
    const caseH = rows * ROW + BOARD
    const high = this.opts.quality === 'high'

    const kit = this.opts.kit
    const woodMat = this.woodMaterial()
    const bodyGeo = new kit.RoundedBoxGeometry(W, H, D, high ? 3 : 2, 0.035)
    const spineGeo = new THREE.PlaneGeometry(W * 0.86, H * 0.965)
    spineGeo.translate(0, 0, D / 2 + 0.004)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.62, metalness: 0.02 })
    this.disposables.push(bodyGeo, spineGeo, bodyMat, woodMat)

    layout.forEach((bookcase, ci) => {
      const x = ci * (caseW + GAP)
      // The frame: back, sides, top and a board per shelf, one geometry.
      const parts: Three.BufferGeometry[] = []
      const box = (w: number, h: number, d: number, px: number, py: number, pz: number) => {
        const g = new kit.RoundedBoxGeometry(w, h, d, 2, Math.min(0.02, h / 3, w / 3))
        g.translate(px, py, pz)
        parts.push(g)
      }
      const depth = D + 0.3
      box(caseW, caseH + BOARD, 0.06, x + caseW / 2, (caseH + BOARD) / 2 - BOARD, -D / 2 - 0.12)
      box(SIDE, caseH + BOARD * 2, depth, x + SIDE / 2, caseH / 2 - BOARD / 2, 0.03)
      box(SIDE, caseH + BOARD * 2, depth, x + caseW - SIDE / 2, caseH / 2 - BOARD / 2, 0.03)
      for (let r = 0; r <= rows; r++)
        box(caseW - 0.01, BOARD, depth, x + caseW / 2, r * ROW - BOARD / 2, 0.03)
      // A plinth and a cornice give it a piece of furniture's weight.
      box(caseW + 0.12, 0.2, depth + 0.1, x + caseW / 2, -BOARD - 0.1, 0.06)
      box(caseW + 0.16, 0.12, depth + 0.14, x + caseW / 2, caseH + 0.02, 0.07)
      const frame = new THREE.Mesh(kit.mergeGeometries(parts)!, woodMat)
      frame.castShadow = true
      frame.receiveShadow = true
      parts.forEach(p => p.dispose())
      this.scene.add(frame)
      this.disposables.push(frame.geometry)
      this.addPlaques(bookcase, x, caseW, rows)

      // The binders: one instanced mesh for the bodies, one for the spines.
      const count = bookcase.rows.reduce((n, r) => n + r.binders.length, 0)
      const atlas = new SpineAtlas(THREE, Math.max(1, count), high ? 128 : 80, high ? 512 : 320)
      const spineMat = new THREE.MeshStandardMaterial({ map: atlas.texture, roughness: 0.55 })
      // Each instance reads its own cell of the atlas.
      spineMat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <uv_pars_vertex>', '#include <uv_pars_vertex>\nattribute vec4 aCell;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = aCell.xy + vMapUv * aCell.zw;\n#endif')
      }
      const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, Math.max(1, count))
      const spines = new THREE.InstancedMesh(spineGeo.clone(), spineMat, Math.max(1, count))
      const cells = new Float32Array(Math.max(1, count) * 4)
      bodies.castShadow = true
      bodies.receiveShadow = true
      spines.receiveShadow = true
      const placed: Placed[] = []
      let i = 0
      bookcase.rows.forEach((row, r) => {
        const y = (rows - 1 - r) * ROW + H / 2 + 0.004
        // Binders in the middle of their shelf.
        const start = x + SIDE + MARGIN + (per - row.binders.length) * PITCH / 2 + PITCH / 2
        row.binders.forEach((binder, slot) => {
          const p: Placed = {
            binder,
            caseIndex: ci,
            slot: i,
            base: new THREE.Vector3(start + slot * PITCH, y, 0.02),
            // Now and then one leans on its neighbour.
            lean: (hueOf(binder.set.code) % 9 === 0 && slot > 0) ? 0.045 : 0,
            out: 0,
            target: 0,
          }
          placed.push(p)
          const hue = hueOf(binder.set.code)
          bodies.setColorAt(i, (binder.fresh ? new THREE.Color('#e8e1d2') : new THREE.Color(`hsl(${hue}, 38%, 26%)`)))
          cells.set(atlas.uv(i), i * 4)
          const imgs = images(binder)
          atlas.draw(i, this.spec(binder, imgs.icon, imgs.art))
          i++
        })
      })
      spines.geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 4))
      this.scene.add(bodies, spines)
      this.disposables.push(atlas, spineMat, spines.geometry)
      const built: BuiltCase = { width: caseW, x, bodies, spines, atlas, placed }
      this.cases.push(built)
      placed.forEach(p => this.place(built, p))
      bodies.instanceMatrix.needsUpdate = true
      spines.instanceMatrix.needsUpdate = true
      if (bodies.instanceColor)
        bodies.instanceColor.needsUpdate = true
    })

    const span = { width: layout.length * (caseW + GAP) - GAP, height: caseH, depth: D }
    this.lights(span)
    this.ambiance = this.opts.buildAmbiance(THREE, kit, this.scene, span, this.opts.universe, this.opts.quality)
    // Centred between the plinth and the cornice.
    this.camY = (caseH - 0.35) / 2
    this.resize()
    this.camX = this.camTargetX = this.caseCenter(0)
    this.shadowDirty = true
    this.life()
  }

  private spec(b: ShelfBinder, icon: HTMLImageElement | null, art: HTMLImageElement | null) {
    return { name: b.set.name, code: b.set.code, hue: hueOf(b.set.code), owned: b.set.owned, total: b.set.total, fresh: b.fresh, icon, art, freshLabel: this.opts.freshLabel }
  }

  /** Repaint one spine (its symbol or art arrived, its progress moved). */
  repaint(code: string, icon: HTMLImageElement | null, art: HTMLImageElement | null): void {
    for (const c of this.cases) {
      const p = c.placed.find(x => x.binder.set.code === code)
      if (p) {
        c.atlas.draw(p.slot, this.spec(p.binder, icon, art))
        this.invalidate()
      }
    }
  }

  private woodMaterial(): Three.MeshStandardMaterial {
    const { THREE } = this
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 256
    const g = c.getContext('2d')!
    const optcg = this.opts.universe === 'optcg'
    g.fillStyle = optcg ? '#8a5a32' : '#3b2415'
    g.fillRect(0, 0, 1024, 256)
    // Grain: long wavy streaks, a knot now and then.
    for (let i = 0; i < 140; i++) {
      const y = Math.random() * 256
      g.strokeStyle = optcg
        ? `rgba(${60 + Math.random() * 40},${35 + Math.random() * 20},15,${0.12 + Math.random() * 0.2})`
        : `rgba(${15 + Math.random() * 20},${8 + Math.random() * 10},4,${0.18 + Math.random() * 0.25})`
      g.lineWidth = 0.6 + Math.random() * 2.2
      g.beginPath()
      g.moveTo(0, y)
      for (let x = 0; x <= 1024; x += 64)
        g.lineTo(x, y + Math.sin(x / 90 + i) * 3 + (Math.random() - 0.5) * 2)
      g.stroke()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(2, 2)
    tex.anisotropy = 8
    this.disposables.push(tex)
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, metalness: 0.02 })
  }

  /** Brass plates on each shelf's front edge, their labels from one texture. */
  private addPlaques(bookcase: Bookcase, x: number, caseW: number, rows: number): void {
    const { THREE } = this
    const { ROW, BOARD, D } = DIM
    const n = bookcase.rows.length
    if (!n)
      return
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 96 * n
    const g = c.getContext('2d')!
    const geos: Three.BufferGeometry[] = []
    bookcase.rows.forEach((row, r) => {
      const y0 = r * 96
      const brass = g.createLinearGradient(0, y0, 0, y0 + 96)
      brass.addColorStop(0, '#e7c878')
      brass.addColorStop(0.5, '#b08a3e')
      brass.addColorStop(1, '#8b6a2a')
      g.fillStyle = brass
      g.fillRect(0, y0, 512, 96)
      g.strokeStyle = 'rgba(60,40,10,0.6)'
      g.lineWidth = 4
      g.strokeRect(6, y0 + 6, 500, 84)
      g.fillStyle = '#3a2a10'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      let size = 46
      g.font = `700 ${size}px Georgia, serif`
      while (g.measureText(row.label).width > 470 && size > 24) {
        size -= 2
        g.font = `700 ${size}px Georgia, serif`
      }
      g.fillText(row.label, 256, y0 + 50)
      const plate = new THREE.PlaneGeometry(1.7, 0.3)
      // This plate's strip of the texture.
      const uv = plate.getAttribute('uv') as Three.BufferAttribute
      for (let k = 0; k < uv.count; k++)
        uv.setY(k, 1 - (r + 1 - uv.getY(k)) / n)
      // Hung under the board's top edge, in front of it.
      const board = (rows - 1 - r) * ROW - BOARD / 2 - 0.1
      plate.translate(x + caseW / 2, board, (D + 0.3) / 2 + 0.035)
      geos.push(plate)
    })
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.75, roughness: 0.35 })
    const mesh = new THREE.Mesh(this.opts.kit.mergeGeometries(geos)!, mat)
    geos.forEach(g2 => g2.dispose())
    this.scene.add(mesh)
    this.disposables.push(tex, mat, mesh.geometry)
  }

  private lights(span: { width: number, height: number }): void {
    const { THREE } = this
    const warm = this.opts.universe === 'mtg' ? 0xFFD9A8 : 0xFFE7C4
    this.scene.add(new THREE.HemisphereLight(0xFFF1DD, 0x2A1C12, this.opts.universe === 'mtg' ? 0.5 : 0.75))
    const key = new THREE.DirectionalLight(warm, 1.7)
    key.position.set(span.width / 2 + 2.5, span.height + 3, 6)
    key.target.position.set(span.width / 2, span.height / 2, 0)
    key.castShadow = true
    const size = this.opts.quality === 'high' ? 2048 : 1024
    key.shadow.mapSize.set(size, size)
    const half = Math.max(span.width, span.height) / 2 + 1.5
    Object.assign(key.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 30 })
    key.shadow.bias = -0.0006
    key.shadow.normalBias = 0.02
    key.shadow.radius = 4
    this.scene.add(key, key.target)
    this.key = key
  }

  // ---- Placing and moving ------------------------------------------------

  private readonly m4 = () => new this.THREE.Matrix4()
  private place(c: BuiltCase, p: Placed): void {
    const { THREE } = this
    const m = this.m4()
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, p.lean))
    const hidden = this.opening?.p === p
    m.compose(new THREE.Vector3(p.base.x, p.base.y, p.base.z + p.out), q, hidden ? new THREE.Vector3(0.0001, 0.0001, 0.0001) : new THREE.Vector3(1, 1, 1))
    c.bodies.setMatrixAt(p.slot, m)
    c.spines.setMatrixAt(p.slot, m)
    c.bodies.instanceMatrix.needsUpdate = true
    c.spines.instanceMatrix.needsUpdate = true
  }

  private caseCenter(i: number): number {
    const c = this.cases[i]
    return c ? c.x + c.width / 2 : 0
  }

  /** Bring a bookcase in front of the camera. */
  goTo(index: number): void {
    const i = Math.max(0, Math.min(this.cases.length - 1, index))
    this.caseIndex = i
    this.camTargetX = this.caseCenter(i)
    this.opts.caseChange(i)
    this.life()
  }

  get bookcases(): number {
    return this.cases.length
  }

  /** Slide a binder out and light it (search, touch). */
  focus(code: string): void {
    const found = this.find(code)
    if (!found)
      return
    if (found.caseIndex !== this.caseIndex)
      this.goTo(found.caseIndex)
    this.setHover(found)
    setTimeout(() => this.opts.hover(found.binder, this.screenOf(found)), 700)
  }

  private find(code: string): Placed | null {
    for (const c of this.cases) {
      const p = c.placed.find(x => x.binder.set.code === code)
      if (p)
        return p
    }
    return null
  }

  private setHover(p: Placed | null): void {
    if (this.hovered === p)
      return
    if (this.hovered)
      this.hovered.target = 0
    this.hovered = p
    if (p)
      p.target = 0.36
    this.life()
  }

  private screenOf(p: Placed): { x: number, y: number } {
    const v = new this.THREE.Vector3(p.base.x, p.base.y + DIM.H / 2, p.base.z + p.out + DIM.D / 2).project(this.camera)
    return { x: (v.x + 1) / 2 * this.width, y: (1 - v.y) / 2 * this.height }
  }

  // ---- Opening -------------------------------------------------------------

  /** Pull a binder off its shelf, turn it to face you, open it flat. */
  open(code: string, pages?: { left: HTMLCanvasElement, right: HTMLCanvasElement }): void {
    const p = this.find(code)
    if (!p || this.opening)
      return
    this.opts.hover(null, null)
    if (p.caseIndex !== this.caseIndex)
      this.goTo(p.caseIndex)
    const rig = this.rig(p, pages)
    rig.group.position.set(p.base.x, p.base.y, p.base.z + p.out)
    this.scene.add(rig.group)
    this.opening = { p, t0: performance.now(), rig: rig.group, cover: rig.cover, done: false }
    this.place(this.cases[p.caseIndex]!, p)
    this.shadowDirty = true
    this.life()
  }

  /**
   * The binder that opens: covers, spine, rings, a page of pockets on each
   * side (the set's first pages when the page hands them over), the set's art
   * on the front. Built for this one binder only.
   */
  private rig(p: Placed, pages?: { left: HTMLCanvasElement, right: HTMLCanvasElement }): { group: Three.Group, cover: Three.Object3D } {
    const { THREE } = this
    const { W, H, D } = DIM
    const kit = this.opts.kit
    const hue = hueOf(p.binder.set.code)
    const color = p.binder.fresh ? new THREE.Color('#e8e1d2') : new THREE.Color(`hsl(${hue}, 38%, 26%)`)
    const leather = new THREE.MeshStandardMaterial({ color, roughness: 0.58 })
    const lining = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.55), roughness: 0.8 })
    const metal = new THREE.MeshStandardMaterial({ color: 0xD8D8DE, metalness: 1, roughness: 0.25 })
    const pageMat = (canvas: HTMLCanvasElement | undefined) => {
      const tex = new THREE.CanvasTexture(canvas ?? pocketPage())
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      this.disposables.push(tex)
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })
    }
    const group = new THREE.Group()
    const back = new THREE.Mesh(new kit.RoundedBoxGeometry(0.035, H, D, 2, 0.012), leather)
    back.position.x = -W / 2 + 0.018
    const spine = new THREE.Mesh(new kit.RoundedBoxGeometry(W, H, 0.035, 2, 0.012), leather)
    spine.position.z = D / 2 - 0.018
    // The right page, on the back cover.
    const right = new THREE.Mesh(new THREE.PlaneGeometry(D * 0.94, H * 0.94), pageMat(pages?.right))
    right.rotation.y = Math.PI / 2
    right.position.set(-W / 2 + 0.04, 0, -0.01)
    // Rings on the spine's inside.
    for (const ry of [-0.34, 0, 0.34]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 24), metal)
      ring.rotation.x = Math.PI / 2
      ring.position.set(-W / 2 + 0.1, ry * H, D / 2 - 0.12)
      group.add(ring)
    }
    // The front cover hinges on the spine's edge: the art outside, a page inside.
    const cover = new THREE.Group()
    cover.position.set(W / 2 - 0.018, 0, D / 2)
    const plate = new THREE.Mesh(new kit.RoundedBoxGeometry(0.035, H, D, 2, 0.012), leather)
    plate.position.z = -D / 2
    const artMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 })
    const art = new THREE.Mesh(new THREE.PlaneGeometry(D * 0.9, H * 0.9), artMat)
    art.rotation.y = Math.PI / 2
    art.position.set(0.019, 0, -D / 2)
    const left = new THREE.Mesh(new THREE.PlaneGeometry(D * 0.94, H * 0.94), pageMat(pages?.left))
    left.rotation.y = -Math.PI / 2
    left.position.set(-0.019, 0, -D / 2)
    cover.add(plate, art, left)
    group.add(back, spine, right, cover)
    group.traverse((o) => {
      if ((o as Three.Mesh).isMesh)
        (o as Three.Mesh).castShadow = true
    })
    this.disposables.push(leather, lining, metal, artMat)
    if (p.binder.set.art) {
      new THREE.TextureLoader().load(p.binder.set.art, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
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
        artMat.map = tex
        artMat.color.set(0xFFFFFF)
        artMat.needsUpdate = true
        this.disposables.push(tex)
        this.invalidate()
      })
    }
    return { group, cover }
  }

  private stepOpening(now: number): boolean {
    const o = this.opening
    if (!o || o.done)
      return false
    const { THREE } = this
    const s = (now - o.t0) / 1000 * (this.opts.reducedMotion ? 6 : 1)
    const p1 = ease(Math.min(1, s / 0.35))
    const from = new THREE.Vector3(o.p.base.x, o.p.base.y, o.p.base.z + 0.36 + p1 * 0.9)
    const p2 = ease(Math.min(1, Math.max(0, (s - 0.28) / 0.7)))
    // In front of the camera, where the open binder fills most of the view.
    const dest = new THREE.Vector3(this.camX + DIM.D / 2, this.camY, this.camZ - this.openDistance())
    o.rig.position.lerpVectors(from, dest, p2)
    o.rig.rotation.set(0, -Math.PI / 2 * p2, 0)
    const p3 = ease(Math.min(1, Math.max(0, (s - 0.9) / 0.7)))
    o.cover.rotation.y = -Math.PI * 0.98 * p3
    if (s >= 1.65) {
      o.done = true
      this.renderer.render(this.scene, this.camera)
      const still = this.renderer.domElement.toDataURL('image/jpeg', 0.85)
      this.opts.opened(o.p.binder, { rect: this.openRect(o.rig), still })
      return false
    }
    return true
  }

  /** How far from the camera the open binder stands: its two pages fill most of the view. */
  private openDistance(): number {
    const tan = Math.tan((this.camera.fov * Math.PI) / 360)
    const byHeight = DIM.H / 0.82 / 2 / tan
    const byWidth = (DIM.D * 2) / 0.9 / 2 / (tan * this.camera.aspect)
    return Math.max(byHeight, byWidth)
  }

  /** The open binder's two pages, on screen. */
  private openRect(rig: Three.Group): DOMRect {
    const { THREE } = this
    rig.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(rig)
    const corners = [new THREE.Vector3(box.min.x, box.min.y, box.max.z), new THREE.Vector3(box.max.x, box.max.y, box.max.z)]
    const pts = corners.map((c) => {
      const v = c.project(this.camera)
      return { x: (v.x + 1) / 2 * this.width, y: (1 - v.y) / 2 * this.height }
    })
    const r = this.host.getBoundingClientRect()
    return new DOMRect(r.left + Math.min(pts[0]!.x, pts[1]!.x), r.top + Math.min(pts[0]!.y, pts[1]!.y), Math.abs(pts[1]!.x - pts[0]!.x), Math.abs(pts[1]!.y - pts[0]!.y))
  }

  // ---- Pointer -------------------------------------------------------------

  private pick(e: PointerEvent): Placed | null {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.camera)
    const hit = this.ray.intersectObjects(this.cases.map(c => c.bodies), false)[0]
    if (!hit || hit.instanceId == null)
      return null
    const c = this.cases.find(x => x.bodies === hit.object)
    return c?.placed[hit.instanceId] ?? null
  }

  private readonly onMove = (e: PointerEvent) => {
    if (this.opening)
      return
    const r = this.renderer.domElement.getBoundingClientRect()
    if (e.pointerType === 'mouse') {
      this.parallax.tx = ((e.clientX - r.left) / r.width - 0.5) * 0.35
      this.parallax.ty = ((e.clientY - r.top) / r.height - 0.5) * 0.18
    }
    if (this.drag) {
      const dx = e.clientX - this.drag.x
      if (Math.abs(dx) > 6)
        this.drag.moved = true
      if (this.drag.moved) {
        this.camTargetX = this.camX = this.drag.camX - dx * (this.visibleWidth() / this.width)
        this.opts.hover(null, null)
        this.life()
      }
      return
    }
    if (e.pointerType !== 'mouse')
      return
    const p = this.pick(e)
    this.setHover(p)
    this.opts.hover(p?.binder ?? null, p ? { x: e.clientX - r.left, y: e.clientY - r.top } : null)
    this.renderer.domElement.style.cursor = p ? 'pointer' : 'grab'
    this.life()
  }

  private readonly onDown = (e: PointerEvent) => {
    if (this.opening)
      return
    this.drag = { x: e.clientX, camX: this.camX, moved: false, pointer: e.pointerType }
  }

  private readonly onUp = (e: PointerEvent) => {
    const drag = this.drag
    this.drag = null
    if (this.opening || !drag)
      return
    if (drag.moved) {
      // Settle on the nearest bookcase.
      let best = 0
      this.cases.forEach((_, i) => {
        if (Math.abs(this.caseCenter(i) - this.camX) < Math.abs(this.caseCenter(best) - this.camX))
          best = i
      })
      this.goTo(best)
      return
    }
    const p = this.pick(e)
    if (!p) {
      this.setHover(null)
      this.opts.hover(null, null)
      return
    }
    // Touch: a first tap takes it out, a second opens it.
    if (e.pointerType !== 'mouse' && this.hovered !== p) {
      this.setHover(p)
      this.opts.hover(p.binder, this.screenOf(p))
      return
    }
    this.opts.pick(p.binder)
  }

  private readonly onLeave = () => {
    if (this.drag?.pointer === 'mouse')
      this.drag = null
    this.parallax.tx = 0
    this.parallax.ty = 0
    if (!this.opening) {
      this.setHover(null)
      this.opts.hover(null, null)
    }
  }

  private readonly onWheel = (e: WheelEvent) => {
    if (this.cases.length < 2 || this.opening)
      return
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0)
    if (!d)
      return
    e.preventDefault()
    this.wheelAcc += d
    clearTimeout(this.wheelTimer)
    this.wheelTimer = setTimeout(() => {
      if (Math.abs(this.wheelAcc) > 40)
        this.goTo(this.caseIndex + Math.sign(this.wheelAcc))
      this.wheelAcc = 0
    }, 80)
  }

  private wheelAcc = 0
  private wheelTimer: ReturnType<typeof setTimeout> | undefined

  private readonly onVisibility = () => {
    if (!document.hidden)
      this.invalidate()
  }

  // ---- Frame loop ----------------------------------------------------------

  private visibleWidth(): number {
    return 2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.camZ * this.camera.aspect
  }

  private resize(): void {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (!w || !h)
      return
    this.width = w
    this.height = h
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    const c = this.cases[0]
    if (c) {
      const tan = Math.tan((this.camera.fov * Math.PI) / 360)
      // The whole bookcase in view, snugly (its front edge, plates included,
      // stands closer than its back: a little extra room for them).
      const caseH = this.camY * 2 + 1
      this.camZ = Math.max(caseH / 2 / tan, (c.width / 2 + 0.35) / (tan * this.camera.aspect)) * 1.06
    }
    this.invalidate()
  }

  /** Keep drawing for a while: the scene lives a little after each touch. */
  life(ms = 6000): void {
    this.lifeUntil = Math.max(this.lifeUntil, performance.now() + ms)
    this.invalidate()
  }

  invalidate(): void {
    this.needs = true
    if (!this.raf)
      this.raf = requestAnimationFrame(this.frame)
  }

  private last = 0
  private readonly frame = (now: number) => {
    this.raf = 0
    if (!this.visible || document.hidden)
      return
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016)
    this.last = now
    let busy = false

    // Camera: glide to the bookcase, a touch of parallax with the mouse.
    const k = Math.min(1, dt * 7)
    this.camX += (this.camTargetX - this.camX) * k
    this.parallax.x += (this.parallax.tx - this.parallax.x) * k
    this.parallax.y += (this.parallax.ty - this.parallax.y) * k
    busy ||= Math.abs(this.camTargetX - this.camX) > 0.002 || Math.abs(this.parallax.tx - this.parallax.x) > 0.001
    this.camera.position.set(this.camX + this.parallax.x, this.camY - this.parallax.y, this.camZ)
    this.camera.lookAt(this.camX, this.camY, 0)

    // Binders sliding out or back.
    for (const c of this.cases) {
      for (const p of c.placed) {
        if (Math.abs(p.target - p.out) > 0.001) {
          p.out += (p.target - p.out) * Math.min(1, dt * 12)
          this.place(c, p)
          busy = true
          this.shadowDirty = true
        }
      }
    }
    busy = this.stepOpening(now) || busy
    if (this.ambiance && now < this.lifeUntil && !this.opts.reducedMotion)
      busy = this.ambiance.update(now / 1000, dt) || true

    if (this.shadowDirty && !busy) {
      this.renderer.shadowMap.needsUpdate = true
      this.shadowDirty = false
    }
    else if (this.stats.frames === 0) {
      this.renderer.shadowMap.needsUpdate = true
    }
    if (this.needs || busy) {
      this.renderer.render(this.scene, this.camera)
      this.stats.calls = this.renderer.info.render.calls
      this.stats.frames++
      this.needs = false
    }
    if (busy || now < this.lifeUntil)
      this.raf = requestAnimationFrame(this.frame)
    else
      this.last = 0
  }

  /** Where the camera sits, for the rig built by the page. */
  get view(): { camera: Three.PerspectiveCamera, scene: Three.Scene } {
    return { camera: this.camera, scene: this.scene }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    clearTimeout(this.wheelTimer)
    this.io.disconnect()
    this.ro.disconnect()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointermove', this.onMove)
    canvas.removeEventListener('pointerdown', this.onDown)
    canvas.removeEventListener('pointerup', this.onUp)
    canvas.removeEventListener('pointerleave', this.onLeave)
    canvas.removeEventListener('wheel', this.onWheel)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.ambiance?.dispose()
    this.scene.traverse((o) => {
      const mesh = o as Three.Mesh
      if (mesh.isMesh && !this.disposables.includes(mesh.geometry))
        mesh.geometry.dispose()
    })
    this.disposables.forEach(d => d.dispose())
    this.renderer.dispose()
    canvas.remove()
  }
}

/** A page of nine empty sleeved pockets, when the real one is not at hand. */
export function pocketPage(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 420
  c.height = 540
  const g = c.getContext('2d')!
  g.fillStyle = '#f2ede2'
  g.fillRect(0, 0, 420, 540)
  const pw = 118
  const ph = 158
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 3; k++) {
      const x = 18 + k * (pw + 12)
      const y = 18 + r * (ph + 14)
      g.fillStyle = '#ddd6c6'
      g.fillRect(x, y, pw, ph)
      g.fillStyle = 'rgba(255,255,255,0.35)'
      g.fillRect(x + 6, y + 4, 10, ph - 8)
      g.strokeStyle = 'rgba(0,0,0,0.1)'
      g.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1)
    }
  }
  return c
}
