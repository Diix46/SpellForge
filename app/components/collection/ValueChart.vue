<script setup lang="ts">
import type { HistoryPoint } from '~/composables/useCollectionHistory'
import { computed, ref } from 'vue'

// The collection's value day by day: an area under the line, the amount paid
// as a dashed line when there is one, a crosshair and its reading under the
// pointer. Plain SVG, scaled to its box.
const props = defineProps<{ points: HistoryPoint[] }>()
const { locale, t } = useLocale()

const W = 800
const H = 240
const PAD = { top: 16, right: 12, bottom: 26, left: 12 }

const money = (n: number) => n.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: n >= 1000 ? 0 : 2 })
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })

const scale = computed(() => {
  const pts = props.points
  const values = pts.flatMap(p => (p.paid > 0 ? [p.value, p.paid] : [p.value]))
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (max - min < 1) {
    min -= 1
    max += 1
  }
  const span = max - min
  min = Math.max(0, min - span * 0.12)
  max += span * 0.08
  const x = (i: number) => PAD.left + (pts.length > 1 ? (i / (pts.length - 1)) * (W - PAD.left - PAD.right) : (W - PAD.left - PAD.right) / 2)
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom)
  return { x, y }
})

const line = computed(() => props.points.map((p, i) => `${i ? 'L' : 'M'}${scale.value.x(i).toFixed(1)},${scale.value.y(p.value).toFixed(1)}`).join(' '))
const area = computed(() => props.points.length > 1
  ? `${line.value} L${scale.value.x(props.points.length - 1).toFixed(1)},${H - PAD.bottom} L${scale.value.x(0).toFixed(1)},${H - PAD.bottom} Z`
  : '')
const paid = computed(() => props.points.some(p => p.paid > 0)
  ? props.points.map((p, i) => `${i ? 'L' : 'M'}${scale.value.x(i).toFixed(1)},${scale.value.y(p.paid).toFixed(1)}`).join(' ')
  : '')
// A few dates along the bottom, never crowded.
const ticks = computed(() => {
  const n = props.points.length
  if (!n)
    return []
  const step = Math.max(1, Math.ceil(n / 6))
  return props.points.map((p, i) => ({ i, day: p.day })).filter(({ i }) => i % step === 0 || i === n - 1)
})

const hover = ref<number | null>(null)
function onMove(e: PointerEvent) {
  const box = (e.currentTarget as SVGElement).getBoundingClientRect()
  const xIn = ((e.clientX - box.left) / box.width) * W
  const n = props.points.length
  if (!n)
    return
  const i = n === 1 ? 0 : Math.round(((xIn - PAD.left) / (W - PAD.left - PAD.right)) * (n - 1))
  hover.value = Math.min(n - 1, Math.max(0, i))
}
const tip = computed(() => {
  if (hover.value == null)
    return null
  const p = props.points[hover.value]!
  const x = scale.value.x(hover.value)
  return { p, x, y: scale.value.y(p.value), left: `${(x / W) * 100}%` }
})
</script>

<template>
  <div class="chart">
    <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="points.length ? money(points.at(-1)!.value) : ''" @pointermove="onMove" @pointerleave="hover = null">
      <defs>
        <linearGradient id="value-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgb(var(--accent-rgb))" stop-opacity="0.32" />
          <stop offset="100%" stop-color="rgb(var(--accent-rgb))" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line v-for="k in 3" :key="k" :x1="PAD.left" :x2="W - PAD.right" :y1="PAD.top + ((H - PAD.top - PAD.bottom) / 3) * (k - 1)" :y2="PAD.top + ((H - PAD.top - PAD.bottom) / 3) * (k - 1)" class="grid" />
      <path v-if="area" :d="area" fill="url(#value-fill)" class="area" />
      <path v-if="paid" :d="paid" class="paid" vector-effect="non-scaling-stroke" />
      <path :d="line" class="line" vector-effect="non-scaling-stroke" />
      <g v-if="tip">
        <line :x1="tip.x" :x2="tip.x" :y1="PAD.top" :y2="H - PAD.bottom" class="cross" vector-effect="non-scaling-stroke" />
      </g>
    </svg>
    <!-- Dates in HTML: the SVG stretches to its box, text would too. -->
    <span
      v-for="tk in ticks"
      :key="tk.i"
      class="tick"
      :style="{ left: `${(scale.x(tk.i) / W) * 100}%`, transform: tk.i === 0 ? 'none' : tk.i === points.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }"
    >{{ dayLabel(tk.day) }}</span>
    <span v-if="points.length === 1 && !tip" class="marker" :style="{ left: `${(scale.x(0) / W) * 100}%`, top: `${(scale.y(points[0]!.value) / H) * 100}%` }" />
    <span v-if="tip" class="marker" :style="{ left: tip.left, top: `${(tip.y / H) * 100}%` }" />
    <div v-if="tip" class="tip" :style="{ left: tip.left }" :class="{ 'tip--left': hover! > points.length / 2 }">
      <b>{{ money(tip.p.value) }}</b>
      <span>{{ dayLabel(tip.p.day) }} · {{ tip.p.copies }} {{ t('collection.copies') }}</span>
      <span v-if="tip.p.paid > 0" class="muted">{{ t('collection.paid') }} {{ money(tip.p.paid) }}</span>
    </div>
  </div>
</template>

<style scoped>
.chart {
  position: relative;
  height: 240px;
}
svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  touch-action: none;
}
.grid {
  stroke: var(--color-border-hairline);
  stroke-width: 1;
}
.line {
  fill: none;
  stroke: rgb(var(--accent-rgb));
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.area {
  animation: fade 0.6s ease-out;
}
.paid {
  fill: none;
  stroke: var(--color-text-muted);
  stroke-width: 1.5;
  stroke-dasharray: 5 5;
}
.cross {
  stroke: var(--color-border-strong);
  stroke-width: 1;
}
.tick {
  position: absolute;
  bottom: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  white-space: nowrap;
  color: var(--color-text-muted);
  pointer-events: none;
}
.marker {
  position: absolute;
  width: 11px;
  height: 11px;
  border: 2px solid var(--color-surface-1);
  border-radius: 50%;
  background: rgb(var(--accent-rgb));
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.tip {
  position: absolute;
  top: 0;
  display: grid;
  gap: 1px;
  padding: 6px 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: var(--color-surface-1);
  box-shadow: var(--shadow-elev-1);
  font-size: 12px;
  white-space: nowrap;
  color: var(--color-text-mid);
  transform: translateX(10px);
  pointer-events: none;
}
.tip--left {
  transform: translateX(calc(-100% - 10px));
}
.tip b {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--color-text-high);
}
.muted {
  color: var(--color-text-muted);
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
</style>
