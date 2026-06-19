// v-tilt: pointer-tracking 3D tilt + holographic sheen for cards.
//
// On pointer move the element rotates toward the cursor (rotateX/Y) and lifts;
// a radial highlight follows the pointer via CSS vars the element's ::after reads
// (see .tilt-card in main.css). Everything is GPU-friendly (transform/opacity)
// and disabled under prefers-reduced-motion or coarse (touch) pointers.
//
// Usage:  <div v-tilt> … </div>           (defaults: max 10deg, scale 1.04)
//         <div v-tilt="{ max: 14, scale: 1.06, glare: true }">
//
// The directive only sets CSS custom properties + a couple of classes; the
// actual transitions/transforms live in CSS so they stay themable and cheap.

interface TiltOpts { max?: number, scale?: number, glare?: boolean }

interface TiltState {
  max: number
  scale: number
  glare: boolean
  onEnter: (e: PointerEvent) => void
  onMove: (e: PointerEvent) => void
  onLeave: () => void
  raf: number | null
}

const stateMap = new WeakMap<HTMLElement, TiltState>()

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
function isCoarsePointer(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(pointer: coarse)').matches
}

function apply(el: HTMLElement, rx: number, ry: number, scale: number) {
  el.style.setProperty('--tilt-rx', `${rx.toFixed(2)}deg`)
  el.style.setProperty('--tilt-ry', `${ry.toFixed(2)}deg`)
  el.style.setProperty('--tilt-scale', `${scale}`)
}

function mount(el: HTMLElement, opts: TiltOpts) {
  // Skip entirely when motion is unwanted or on touch (no hover to track).
  if (prefersReducedMotion() || isCoarsePointer())
    return

  const max = opts.max ?? 10
  const scale = opts.scale ?? 1.04
  const glare = opts.glare ?? true

  el.classList.add('tilt-card')
  if (glare)
    el.classList.add('tilt-glare')

  const state: TiltState = {
    max,
    scale,
    glare,
    raf: null,
    onEnter() {
      el.classList.add('is-tilting')
    },
    onMove(e: PointerEvent) {
      if (state.raf != null)
        return
      state.raf = requestAnimationFrame(() => {
        state.raf = null
        const r = el.getBoundingClientRect()
        const px = (e.clientX - r.left) / r.width // 0..1
        const py = (e.clientY - r.top) / r.height // 0..1
        // Rotate toward the cursor: top → +rotateX, right → +rotateY.
        const rx = (0.5 - py) * 2 * state.max
        const ry = (px - 0.5) * 2 * state.max
        apply(el, rx, ry, state.scale)
        // Highlight position for the sheen (percentages).
        el.style.setProperty('--tilt-mx', `${(px * 100).toFixed(1)}%`)
        el.style.setProperty('--tilt-my', `${(py * 100).toFixed(1)}%`)
      })
    },
    onLeave() {
      if (state.raf != null) {
        cancelAnimationFrame(state.raf)
        state.raf = null
      }
      el.classList.remove('is-tilting')
      apply(el, 0, 0, 1)
    },
  }

  el.addEventListener('pointerenter', state.onEnter)
  el.addEventListener('pointermove', state.onMove)
  el.addEventListener('pointerleave', state.onLeave)
  stateMap.set(el, state)
}

function unmount(el: HTMLElement) {
  const state = stateMap.get(el)
  if (!state)
    return
  el.removeEventListener('pointerenter', state.onEnter)
  el.removeEventListener('pointermove', state.onMove)
  el.removeEventListener('pointerleave', state.onLeave)
  if (state.raf != null)
    cancelAnimationFrame(state.raf)
  stateMap.delete(el)
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('tilt', {
    mounted(el: HTMLElement, binding) {
      mount(el, (binding.value as TiltOpts) ?? {})
    },
    beforeUnmount(el: HTMLElement) {
      unmount(el)
    },
  })
})
