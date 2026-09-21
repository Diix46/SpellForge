<script setup lang="ts">
// Magic backdrop: the playmat you build on. A stitched mat with its zones
// drawn in the felt, under a low lamp, with the dust that floats in that
// light — brass, or the commander's colours on a deck page (useAppTheme).
// Still under reduced motion; paused while the tab is hidden.
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

const { auroraRgb, isThemed } = useAppTheme()

const canvas = useTemplateRef<HTMLCanvasElement>('dust')
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
  const count = window.innerWidth < 640 ? 10 : 22
  interface Mote { x: number, y: number, r: number, vy: number, vx: number, life: number }
  const motes: Mote[] = []

  const resize = () => {
    w = cv.width = window.innerWidth * dpr
    h = cv.height = window.innerHeight * dpr
  }
  // Dust drifts down through the lamp light, slower than embers ever rose.
  const spawn = (fresh = false): Mote => ({
    x: Math.random() * w,
    y: fresh ? Math.random() * h : -20 * dpr,
    r: (Math.random() * 1.1 + 0.35) * dpr,
    vy: (Math.random() * 0.14 + 0.05) * dpr,
    vx: (Math.random() - 0.5) * 0.1 * dpr,
    life: Math.random(),
  })
  resize()
  for (let i = 0; i < count; i++) motes.push(spawn(true))

  // Read each frame, so the dust follows a commander change without a restart.
  const style = getComputedStyle(document.documentElement)
  const draw = () => {
    const universe = style.getPropertyValue('--accent-rgb').trim() || '201, 162, 78'
    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'
    motes.forEach((m, i) => {
      const rgb = isThemed.value ? auroraRgb.value[i % 2] : universe
      m.y += m.vy
      m.x += m.vx + Math.sin(m.y / (90 * dpr)) * 0.08 * dpr
      m.life += 0.003
      if (m.y > h + 10)
        Object.assign(m, spawn())
      // Brightest in the upper third, where the lamp actually reaches.
      const lit = Math.max(0.15, 1 - m.y / h)
      const a = (0.12 + 0.2 * Math.abs(Math.sin(m.life * 2.6))) * lit
      ctx.beginPath()
      ctx.arc(m.x, m.y, m.r, 0, 6.283)
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
  <div class="table" aria-hidden="true">
    <!-- The mat: stitched edge, then the zones a game is laid out in. -->
    <svg class="mat" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid meet">
      <rect class="stitch" x="6" y="6" width="348" height="188" rx="10" />
      <g class="zones">
        <!-- the row you play into -->
        <rect x="96" y="30" width="26" height="36" rx="3" />
        <rect x="130" y="30" width="26" height="36" rx="3" />
        <rect x="164" y="30" width="26" height="36" rx="3" />
        <rect x="198" y="30" width="26" height="36" rx="3" />
        <rect x="232" y="30" width="26" height="36" rx="3" />
        <!-- lands, in front -->
        <rect x="96" y="84" width="26" height="36" rx="3" opacity=".7" />
        <rect x="130" y="84" width="26" height="36" rx="3" opacity=".7" />
        <rect x="164" y="84" width="26" height="36" rx="3" opacity=".7" />
        <rect x="198" y="84" width="26" height="36" rx="3" opacity=".7" />
        <!-- library and graveyard on the right, command zone on the left -->
        <rect x="292" y="30" width="30" height="42" rx="3" opacity=".85" />
        <rect x="292" y="84" width="30" height="42" rx="3" opacity=".5" />
        <rect class="command" x="38" y="56" width="34" height="48" rx="4" />
      </g>
    </svg>
    <canvas ref="dust" class="dust" />
  </div>
</template>

<style scoped>
.table {
  position: fixed;
  inset: 0;
  z-index: var(--z-background);
  overflow: hidden;
  pointer-events: none;
  /* The lamp over the table. */
  background: radial-gradient(1200px 520px at 50% -10%, rgba(var(--accent-rgb), 0.07), transparent 70%);
}
.mat {
  position: absolute;
  left: 50%;
  top: 52%;
  width: min(1180px, 112vw);
  aspect-ratio: 360 / 200;
  transform: translate(-50%, -50%);
  opacity: 0.09;
}
.mat rect {
  fill: none;
  stroke: rgb(var(--accent-rgb));
  stroke-width: 0.7;
}
.stitch {
  stroke-width: 1;
  stroke-dasharray: 5 4;
  opacity: 0.8;
}
.command {
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
/* The mat breathes very slightly, as felt catches the light when you lean in. */
.zones {
  transform-origin: 50% 50%;
  animation: settle 24s ease-in-out infinite alternate;
}
.dust {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
@keyframes settle {
  to {
    opacity: 0.75;
    transform: translateY(-2px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .zones {
    animation: none;
  }
}
</style>
