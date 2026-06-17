<script setup lang="ts">
// Ambient cyber-magic background: aurora mesh (CSS) + drifting mana motes (canvas)
// + cyber grid. Mounted ONCE in the shell. Performance-capped, reduced-motion aware.
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'

const canvas = shallowRef<HTMLCanvasElement | null>(null)
let raf = 0
let onResize: (() => void) | null = null
let onVis: (() => void) | null = null

onMounted(() => {
  const cv = canvas.value
  if (!cv)
    return
  const ctx = cv.getContext('2d')
  if (!ctx)
    return

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let w = 0
  let h = 0
  const isMobile = window.innerWidth < 640
  const CAP = Math.min(isMobile ? 18 : 38, 60)
  const tints = ['34,232,255', '255,56,209']

  interface Mote { x: number, y: number, r: number, vy: number, a: number, c: string }
  const motes: Mote[] = []

  const resize = () => {
    w = cv.width = window.innerWidth * dpr
    h = cv.height = window.innerHeight * dpr
    cv.style.width = `${window.innerWidth}px`
    cv.style.height = `${window.innerHeight}px`
  }
  const spawn = (): Mote => ({
    x: Math.random() * w,
    y: h + Math.random() * h,
    r: (Math.random() * 1.6 + 0.5) * dpr,
    vy: (Math.random() * 0.3 + 0.12) * dpr,
    a: Math.random() * 0.5 + 0.2,
    c: tints[(Math.random() * tints.length) | 0] ?? '34,232,255',
  })

  resize()
  onResize = () => resize()
  window.addEventListener('resize', onResize)

  for (let i = 0; i < CAP; i++) {
    const m = spawn()
    m.y = Math.random() * h
    motes.push(m)
  }

  const draw = () => {
    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'
    for (const m of motes) {
      m.y -= m.vy
      if (m.y < -10)
        Object.assign(m, spawn())
      ctx.beginPath()
      ctx.arc(m.x, m.y, m.r, 0, 6.283)
      ctx.fillStyle = `rgba(${m.c},${m.a})`
      ctx.fill()
    }
    raf = requestAnimationFrame(draw)
  }

  if (reduce) {
    draw()
    cancelAnimationFrame(raf)
  }
  else {
    draw()
    onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden)
        draw()
    }
    document.addEventListener('visibilitychange', onVis)
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  if (onResize)
    window.removeEventListener('resize', onResize)
  if (onVis)
    document.removeEventListener('visibilitychange', onVis)
})
</script>

<template>
  <div
    class="fixed inset-0 pointer-events-none overflow-hidden"
    :style="{ zIndex: 'var(--z-background)' }"
    aria-hidden="true"
  >
    <div class="aurora absolute inset-0 opacity-[.20]" />
    <canvas
      ref="canvas"
      class="mote-canvas absolute inset-0"
      :style="{ zIndex: 'var(--z-particles)' }"
    />
    <div
      class="grid-texture absolute inset-0 opacity-40"
      :style="{ zIndex: 'var(--z-grid)' }"
    />
  </div>
</template>

<style scoped>
.aurora {
  background:
    radial-gradient(60% 60% at 18% 12%, rgba(34, 232, 255, 0.9), transparent 70%),
    radial-gradient(55% 55% at 85% 88%, rgba(255, 56, 209, 0.85), transparent 70%),
    radial-gradient(70% 70% at 50% 50%, rgba(110, 91, 255, 0.5), transparent 70%);
  filter: blur(40px);
  animation: aurora-drift 40s ease-in-out infinite alternate;
}
@keyframes aurora-drift {
  from {
    transform: translate3d(-3%, -2%, 0) scale(1.05);
  }
  to {
    transform: translate3d(3%, 2%, 0) scale(1.15);
  }
}
</style>
