/**
 * The room around the bookcases, one per universe: walls, floor, light and
 * the little that moves (flames, dust, water light). `update` animates it
 * while the scene is awake; the rest of the time it stands still.
 */
import type * as Three from 'three'
import type { Quality, Universe } from './library'

/** Three.js addons the room may need (none yet). */
export type AmbianceKit = Record<string, unknown>

export interface Ambiance {
  /** Advance the room's life; true while something still moves. */
  update: (t: number, dt: number) => boolean
  dispose: () => void
}

interface Span { width: number, height: number, depth: number }

function canvasTexture(THREE: typeof Three, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): Three.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d')!)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function buildAmbiance(THREE: typeof Three, _kit: AmbianceKit, scene: Three.Scene, span: Span, universe: Universe, _quality: Quality): Ambiance {
  const disposables: { dispose: () => void }[] = []
  const mtg = universe === 'mtg'
  const cx = span.width / 2
  // The wall behind, the floor under.
  const wallTex = canvasTexture(THREE, 512, 512, (g) => {
    const grad = g.createRadialGradient(256, 200, 40, 256, 256, 380)
    grad.addColorStop(0, mtg ? '#3a2a33' : '#7a5a3c')
    grad.addColorStop(1, mtg ? '#140d12' : '#3b2a1c')
    g.fillStyle = grad
    g.fillRect(0, 0, 512, 512)
  })
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(span.width + 30, span.height + 14), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1 }))
  wall.position.set(cx, span.height / 2 + 2, -span.depth / 2 - 0.2)
  wall.receiveShadow = true
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(span.width + 30, 14), new THREE.MeshStandardMaterial({ color: mtg ? 0x1A1210 : 0x5A3C24, roughness: 0.9 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(cx, -0.3, 4)
  floor.receiveShadow = true
  scene.add(wall, floor)
  scene.fog = new THREE.Fog(mtg ? 0x120B10 : 0x2E2016, 16, 40)
  disposables.push(wallTex, wall.geometry, wall.material as Three.Material, floor.geometry, floor.material as Three.Material)
  return {
    update: () => false,
    dispose: () => disposables.forEach(d => d.dispose()),
  }
}
