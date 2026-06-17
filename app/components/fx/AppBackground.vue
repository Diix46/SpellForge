<script setup lang="ts">
// Ambient background: aurora mesh + drifting mana motes + cyber grid.
// Mounted ONCE in the shell. Tinted by the active deck's mana identity
// (useAppTheme) so the whole page takes on the deck's colours. Neutral elsewhere.
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { useAppTheme } from '~/composables/useAppTheme'

const { auroraRgb } = useAppTheme()

// Two-stop tint for aurora + motes (1 hue mono, 2 hues multicolour, neutral = platinum).
const tintA = computed(() => auroraRgb.value[0])
const tintB = computed(() => auroraRgb.value[1])

const canvas = shallowRef<HTMLCanvasElement | null>(null)
let raf = 0
let onResize: (() => void) | null = null
let onVis: (() => void) | null = null
// Live tint list read by spawn(); kept in sync with the theme.
let moteTints = [tintA.value, tintB.value]

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

  interface Mote { x: number, y: number, r: number, vy: number, a: number, tint: number }
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
    tint: Math.random() < 0.5 ? 0 : 1, // index into moteTints, resolved at draw time
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
      ctx.fillStyle = `rgba(${moteTints[m.tint] ?? moteTints[0]},${m.a})`
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

// Keep mote colours in sync with the active theme (no restart needed).
watch([tintA, tintB], ([a, b]) => {
  moteTints = [a, b]
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
    :style="{
      'zIndex': 'var(--z-background)',
      '--aurora-a': tintA,
      '--aurora-b': tintB,
    }"
    aria-hidden="true"
  >
    <div
      class="aurora absolute inset-0 transition-opacity duration-700"
      :class="auroraRgb[0] === auroraRgb[1] && auroraRgb[0] === '168, 178, 196' ? 'opacity-[.10]' : 'opacity-[.22]'"
    />
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
    radial-gradient(60% 60% at 18% 12%, rgba(var(--aurora-a), 0.9), transparent 70%),
    radial-gradient(55% 55% at 85% 88%, rgba(var(--aurora-b), 0.85), transparent 70%),
    radial-gradient(70% 70% at 50% 50%, rgba(var(--aurora-a), 0.5), transparent 70%);
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
