<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

// Shape returned by /api/landing/cards (kept in sync with the server route).
interface LandingCard { name: string, art: string, colors: string[] }

// The hero's living backdrop: a pulsing mana aurora + a constellation of floating
// MTG cards that drift on their own and parallax toward the pointer. Each slot
// fills with REAL random card art from Scryfall (different every visit); until
// that resolves — or if it fails — a colour-tinted silhouette shows, so the hero
// is never broken. Pure CSS/transform, no deps. Honors prefers-reduced-motion.

interface FloatSlot {
  glow: string // fallback glow RGB (overridden by the card's colour once loaded)
  x: number // % position
  y: number
  rot: number // base rotation deg
  depth: number // parallax factor (0 far → 1 near)
  scale: number
  delay: number
  opacity: number // far cards fade back for a layered, superposed feel
  blur: number // px — far cards blur into the backdrop (depth of field)
  art?: string // real card art_crop (filled after fetch)
  name?: string
}

// Glow RGB per WUBRG letter (mirrors --color-mana-* / the brand accents) so the
// card's halo matches its real colours once the art loads.
const COLOR_GLOW: Record<string, string> = {
  w: '233,226,200',
  u: '79,168,232',
  b: '140,134,160',
  r: '232,88,68',
  g: '56,184,131',
}
function glowFor(colors: string[]): string {
  const c = colors.find(x => COLOR_GLOW[x])
  return c ? COLOR_GLOW[c]! : '168,178,196' // multicolour/colourless → platinum
}

// A dense, layered scatter of cards around the headline — foreground cards
// (sharp, opaque, larger) frame the edges; background cards (small, faded,
// blurred) fill the gaps and overlap for a "drift of cards" depth effect. The
// centre horizontal band is kept lighter so the headline stays readable. Art is
// slotted in on fetch; glow is a sensible per-slot default until then. Glow
// values cycle WUBRG so the pre-art silhouettes already look varied.
const G = ['79,168,232', '232,88,68', '56,184,131', '233,226,200', '140,134,160', '168,85,247']
// Hand-placed "hero" cards (sharp, large, opaque) + a denser mid layer — these
// carry the composition around the headline.
const HERO_SLOTS: Array<[x: number, y: number, rot: number, depth: number, scale: number, opacity: number, blur: number]> = [
  // Foreground
  [10, 20, -14, 1.0, 1.15, 1, 0],
  [82, 14, 12, 1.0, 1.2, 1, 0],
  [86, 62, 9, 0.85, 1.02, 0.97, 0],
  [7, 64, 11, 0.8, 1.0, 0.97, 0],
  [50, 4, -4, 0.9, 1.05, 0.95, 0],
  // Mid layer
  [21, 80, -9, 0.6, 0.84, 0.88, 0.6],
  [70, 82, -11, 0.62, 0.88, 0.88, 0.6],
  [1, 42, -6, 0.55, 0.78, 0.78, 1],
  [95, 40, 7, 0.55, 0.8, 0.78, 1],
  [31, 10, -5, 0.5, 0.72, 0.78, 1],
  [64, 8, 6, 0.5, 0.74, 0.78, 1],
  [42, 92, 4, 0.5, 0.78, 0.8, 0.8],
]
// A generated BACK CARPET: many small, faded, blurred cards scattered across the
// whole canvas so the dark background is almost entirely covered. Deterministic
// pseudo-scatter (no Math.random at eval → stable SSR/hydration); the centre band
// (y 34–60) is thinned so the headline stays readable.
const BACK_SLOTS: Array<[x: number, y: number, rot: number, depth: number, scale: number, opacity: number, blur: number]> = []
{
  const COLS = 7
  const ROWS = 4
  let k = 0
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      k++
      // jittered grid position (deterministic) across the full canvas
      const jx = ((k * 37) % 11) - 5
      const jy = ((k * 53) % 11) - 5
      const x = Math.round((c + 0.5) * (100 / COLS) + jx)
      const y = Math.round((r + 0.5) * (100 / ROWS) + jy)
      // thin out the central headline band
      if (y > 32 && y < 62 && x > 24 && x < 76)
        continue
      const rot = ((k * 47) % 36) - 18
      const depth = 0.14 + ((k * 7) % 10) / 100 // 0.14–0.23 (far)
      const scale = 0.4 + ((k * 13) % 16) / 100 // 0.40–0.55 (small)
      const opacity = 0.22 + ((k * 11) % 14) / 100 // 0.22–0.35 (faded)
      const blur = 3 + ((k * 5) % 3) // 3–5px (soft)
      BACK_SLOTS.push([x, y, rot, depth, scale, opacity, blur])
    }
  }
}
const RAW_SLOTS = [...BACK_SLOTS, ...HERO_SLOTS] // back first → hero paints on top
const CARDS = ref<FloatSlot[]>(
  RAW_SLOTS.map(([x, y, rot, depth, scale, opacity, blur], i) => ({
    glow: G[i % G.length]!,
    x,
    y,
    rot,
    depth,
    scale,
    opacity,
    blur,
    delay: (i % 7) * 0.45, // stagger the idle bob so they don't pulse in unison
  })),
)

// Fetch the random-art pool and slot a fresh pick into each card on every visit.
// Best-effort: a failure just leaves the silhouettes, so the hero never breaks.
async function loadArt() {
  try {
    // Cache-bust per load so the browser never reuses a stale pool — we want the
    // hero to change every visit. (The server still caches upstream Scryfall.)
    const { cards } = await $fetch<{ cards: LandingCard[] }>('/api/landing/cards', {
      query: { _: Date.now() },
    })
    if (!cards?.length)
      return
    // Shuffle once; assign sequentially so every slot gets a distinct card. If
    // there are more slots than cards, wrap around (a repeat far in the back is
    // invisible). This guarantees no slot is left as a bare silhouette.
    const shuffled = [...cards].sort(() => Math.random() - 0.5)
    CARDS.value = CARDS.value.map((slot, i) => {
      const pick = shuffled[i % shuffled.length]!
      return { ...slot, art: pick.art, name: pick.name, glow: glowFor(pick.colors) }
    })
  }
  catch {
    // keep the silhouettes
  }
}

const root = ref<HTMLElement | null>(null)
const px = ref(0) // pointer offset, -1..1
const py = ref(0)
let raf = 0
let reduce = false

function onPointer(e: PointerEvent) {
  if (reduce)
    return
  const w = window.innerWidth || 1
  const h = window.innerHeight || 1
  // Smooth toward the pointer for a lazy, weighty parallax.
  const tx = (e.clientX / w - 0.5) * 2
  const ty = (e.clientY / h - 0.5) * 2
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    px.value += (tx - px.value) * 0.5
    py.value += (ty - py.value) * 0.5
  })
}

onMounted(() => {
  reduce = import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduce && import.meta.client)
    window.addEventListener('pointermove', onPointer, { passive: true })
  loadArt()
})
onBeforeUnmount(() => {
  if (import.meta.client)
    window.removeEventListener('pointermove', onPointer)
  cancelAnimationFrame(raf)
})

// Parallax translate for a card given its depth (near cards move more).
function cardStyle(c: FloatSlot) {
  const tx = -px.value * 30 * c.depth
  const ty = -py.value * 30 * c.depth
  return {
    'left': `${c.x}%`,
    'top': `${c.y}%`,
    'zIndex': Math.round(c.depth * 10), // nearer = on top, for real overlap layering
    '--rot': `${c.rot}deg`,
    '--depth-x': `${tx}px`,
    '--depth-y': `${ty}px`,
    '--glow': c.glow,
    '--scale': c.scale,
    '--opacity': c.opacity,
    '--blur': `${c.blur}px`,
    'animationDelay': `${c.delay}s`,
  }
}
</script>

<template>
  <div ref="root" class="backdrop" aria-hidden="true">
    <!-- Pulsing mana aurora -->
    <div class="aurora aurora-1" />
    <div class="aurora aurora-2" />
    <div class="aurora aurora-3" />

    <!-- Dotted grid that fades toward the edges -->
    <div class="grid-overlay" />

    <!-- Floating cards: real Scryfall art when loaded, glow silhouette as fallback -->
    <div
      v-for="(c, i) in CARDS"
      :key="i"
      class="float-card"
      :class="{ 'has-art': !!c.art }"
      :style="cardStyle(c)"
    >
      <div class="fc-inner">
        <img
          v-if="c.art"
          :src="c.art"
          :alt="c.name"
          loading="eager"
          decoding="async"
          class="fc-photo"
        >
        <template v-else>
          <span class="fc-gem" />
          <span class="fc-art" />
          <span class="fc-line" />
          <span class="fc-line short" />
        </template>
        <span class="fc-sheen" />
      </div>
    </div>

    <!-- Vignette so text stays readable over the show -->
    <div class="vignette" />
  </div>
</template>

<style scoped>
.backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

/* ---- Aurora blobs ---- */
.aurora {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.5;
  will-change: transform, opacity;
}
.aurora-1 {
  width: 46vw;
  height: 46vw;
  left: -8vw;
  top: -10vw;
  background: radial-gradient(circle, rgba(79, 168, 232, 0.55), transparent 65%);
  animation: drift1 18s ease-in-out infinite;
}
.aurora-2 {
  width: 40vw;
  height: 40vw;
  right: -6vw;
  top: -4vw;
  background: radial-gradient(circle, rgba(168, 85, 247, 0.5), transparent 65%);
  animation: drift2 22s ease-in-out infinite;
}
.aurora-3 {
  width: 50vw;
  height: 50vw;
  left: 30vw;
  bottom: -22vw;
  background: radial-gradient(circle, rgba(56, 184, 131, 0.4), transparent 65%);
  animation: drift3 26s ease-in-out infinite;
}
@keyframes drift1 {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
    opacity: 0.45;
  }
  50% {
    transform: translate(6vw, 4vw) scale(1.12);
    opacity: 0.6;
  }
}
@keyframes drift2 {
  0%,
  100% {
    transform: translate(0, 0) scale(1.05);
    opacity: 0.4;
  }
  50% {
    transform: translate(-5vw, 5vw) scale(0.92);
    opacity: 0.58;
  }
}
@keyframes drift3 {
  0%,
  100% {
    transform: translate(0, 0) scale(0.95);
    opacity: 0.35;
  }
  50% {
    transform: translate(-4vw, -4vw) scale(1.1);
    opacity: 0.5;
  }
}

/* ---- Dotted grid ---- */
.grid-overlay {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 34px 34px;
  -webkit-mask-image: radial-gradient(110% 90% at 50% 30%, #000 35%, transparent 78%);
  mask-image: radial-gradient(110% 90% at 50% 30%, #000 35%, transparent 78%);
}

/* ---- Floating cards ---- */
.float-card {
  position: absolute;
  width: clamp(92px, 10vw, 156px);
  aspect-ratio: 63 / 88;
  opacity: var(--opacity, 1);
  filter: blur(var(--blur, 0));
  transform: translate(var(--depth-x, 0), var(--depth-y, 0)) rotate(var(--rot)) scale(var(--scale));
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  animation: bob 9s ease-in-out infinite;
  will-change: transform;
}
.fc-inner {
  position: absolute;
  inset: 0;
  border-radius: 12px;
  background: linear-gradient(160deg, rgba(var(--glow), 0.22), rgba(10, 10, 11, 0.85) 55%), var(--color-surface-1);
  border: 1px solid rgba(var(--glow), 0.5);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.4),
    0 24px 60px -16px rgba(var(--glow), 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  padding: 9%;
  display: flex;
  flex-direction: column;
  gap: 7%;
  overflow: hidden;
}
/* Real art fills the whole card face (no skeleton padding). */
.has-art .fc-inner {
  padding: 0;
}
.fc-photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Fade in once decoded — feels intentional, not a pop-in. */
  animation: artIn 0.7s var(--ease-out, ease) both;
}
@keyframes artIn {
  from {
    opacity: 0;
    transform: scale(1.06);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
/* Glossy sheen + colour wash over the art for a premium, on-brand look. */
.fc-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(160deg, rgba(var(--glow), 0.18), transparent 45%),
    linear-gradient(0deg, rgba(10, 10, 11, 0.5), transparent 55%),
    linear-gradient(115deg, transparent 40%, rgba(255, 255, 255, 0.1) 50%, transparent 60%);
}
.fc-gem {
  width: 18%;
  aspect-ratio: 1;
  align-self: flex-end;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 12px 1px rgba(var(--glow), 0.9);
}
.fc-art {
  flex: 1;
  border-radius: 7px;
  background: radial-gradient(60% 60% at 50% 30%, rgba(var(--glow), 0.5), transparent 70%), rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.fc-line {
  height: 6%;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.14);
}
.fc-line.short {
  width: 60%;
}
@keyframes bob {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -14px;
  }
}

.vignette {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 80% at 50% 8%, transparent 40%, rgba(10, 10, 11, 0.55) 100%),
    linear-gradient(180deg, transparent 55%, var(--color-bg-base) 100%);
}

@media (prefers-reduced-motion: reduce) {
  .aurora,
  .float-card {
    animation-duration: 40s;
  }
  .float-card {
    transition: none;
  }
}
</style>
