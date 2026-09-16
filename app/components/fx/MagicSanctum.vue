<script setup lang="ts">
// Magic backdrop: a summoning circle turning slowly behind the page, and
// embers rising from below: gold, or the commander's colours on a deck page
// (useAppTheme). Still under reduced motion; paused while the tab is hidden.
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

const { auroraRgb, isThemed } = useAppTheme()

const canvas = useTemplateRef<HTMLCanvasElement>('embers')
let raf = 0
let stop: (() => void) | null = null

onMounted(() => {
  const cv = canvas.value
  const ctx = cv?.getContext('2d')
  if (!cv || !ctx || matchMedia('(prefers-reduced-motion: reduce)').matches)
    return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let w = 0
  let h = 0
  const count = window.innerWidth < 640 ? 14 : 30
  interface Ember { x: number, y: number, r: number, vy: number, vx: number, life: number }
  const embers: Ember[] = []

  const resize = () => {
    w = cv.width = window.innerWidth * dpr
    h = cv.height = window.innerHeight * dpr
  }
  const spawn = (fresh = false): Ember => ({
    x: Math.random() * w,
    y: fresh ? Math.random() * h : h + Math.random() * 40 * dpr,
    r: (Math.random() * 1.4 + 0.4) * dpr,
    vy: (Math.random() * 0.35 + 0.15) * dpr,
    vx: (Math.random() - 0.5) * 0.15 * dpr,
    life: Math.random(),
  })
  resize()
  for (let i = 0; i < count; i++) embers.push(spawn(true))

  // Read each frame, so the embers follow a commander change without a restart.
  const style = getComputedStyle(document.documentElement)
  const draw = () => {
    const universe = style.getPropertyValue('--accent-rgb').trim() || '212, 175, 95'
    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'
    embers.forEach((e, i) => {
      const rgb = isThemed.value ? auroraRgb.value[i % 2] : universe
      e.y -= e.vy
      e.x += e.vx + Math.sin(e.y / (60 * dpr)) * 0.12 * dpr
      e.life += 0.004
      if (e.y < -10)
        Object.assign(e, spawn())
      const a = 0.25 + 0.35 * Math.abs(Math.sin(e.life * 3.1))
      ctx.beginPath()
      ctx.arc(e.x, e.y, e.r, 0, 6.283)
      ctx.fillStyle = `rgba(${rgb},${a})`
      ctx.fill()
    })
    raf = requestAnimationFrame(draw)
  }
  const onVisibility = () => {
    cancelAnimationFrame(raf)
    if (!document.hidden)
      draw()
  }
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVisibility)
  draw()
  stop = () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', onVisibility)
  }
})

onBeforeUnmount(() => stop?.())
</script>

<template>
  <div class="sanctum" aria-hidden="true">
    <svg class="circle" viewBox="0 0 200 200">
      <g class="ring-a">
        <circle cx="100" cy="100" r="92" />
        <circle cx="100" cy="100" r="78" opacity=".55" />
        <path d="M100 12 176 144H24z" opacity=".7" />
      </g>
      <g class="ring-b">
        <circle cx="100" cy="100" r="60" opacity=".65" />
        <path d="M100 188 24 56h152z" opacity=".5" />
        <circle cx="100" cy="100" r="38" opacity=".4" />
      </g>
    </svg>
    <canvas ref="embers" class="embers" />
  </div>
</template>

<style scoped>
.sanctum {
  position: fixed;
  inset: 0;
  z-index: var(--z-background);
  overflow: hidden;
  pointer-events: none;
}
.circle {
  position: absolute;
  left: 50%;
  top: 52%;
  width: min(900px, 110vw);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  opacity: 0.07;
}
.circle circle,
.circle path {
  fill: none;
  stroke: rgb(var(--accent-rgb));
  stroke-width: 0.6;
}
.ring-a {
  transform-origin: 50% 50%;
  animation: spin 120s linear infinite;
}
.ring-b {
  transform-origin: 50% 50%;
  animation: spin 90s linear infinite reverse;
}
.embers {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ring-a,
  .ring-b {
    animation: none;
  }
}
</style>
