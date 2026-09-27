<script setup lang="ts">
import type { ShowcaseArt } from '~~/server/api/tcg/[game]/showcase.get'
import { computed } from 'vue'

// Pokémon backdrop: a meadow at the foot of the page, and over its hills the
// mascots peeking — Pikachu first, then Mew, Eevee, Charizard… each one its
// own card's illustration (the showcase), in a round bubble that bobs. Poké
// Balls drift across the sky. Night falls on the meadow in dark mode. Fixed,
// behind everything; still under reduced motion.
const { locale } = useLocale()
const { data } = useFetch<{ arts: ShowcaseArt[] }>('/api/tcg/pokemon/showcase', {
  query: computed(() => ({ lang: locale.value })),
  server: false,
  lazy: true,
  default: () => ({ arts: [] }),
})

// Where each bubble sits along the hills: left edge, height over the hill,
// size; Pikachu (the first) the biggest, on the right.
const SPOTS = [
  { left: 84, bottom: 70, size: 118 },
  { left: 6, bottom: 58, size: 88 },
  { left: 20, bottom: 40, size: 72 },
  { left: 70, bottom: 44, size: 80 },
  { left: 36, bottom: 30, size: 64 },
  { left: 56, bottom: 26, size: 60 },
]
const mascots = computed(() => (data.value?.arts ?? []).slice(0, SPOTS.length).map((a, i) => ({ ...a, spot: SPOTS[i]! })))
const BALLS = [
  { top: 14, dur: 46, delay: 0, size: 26 },
  { top: 28, dur: 60, delay: -22, size: 18 },
  { top: 9, dur: 72, delay: -48, size: 14 },
]
</script>

<template>
  <div class="meadow" aria-hidden="true">
    <svg v-for="(b, i) in BALLS" :key="`ball-${i}`" class="ball" :style="{ top: `${b.top}%`, width: `${b.size}px`, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }" viewBox="0 0 32 32">
      <path d="M2 16a14 14 0 0 1 28 0z" fill="#e03a30" />
      <path d="M2 16a14 14 0 0 0 28 0z" fill="#f7f5ef" />
      <circle cx="16" cy="16" r="14" fill="none" stroke="#1c1c1c" stroke-width="2" />
      <path d="M2 16h28" stroke="#1c1c1c" stroke-width="2" />
      <circle cx="16" cy="16" r="4.5" fill="#f7f5ef" stroke="#1c1c1c" stroke-width="2" />
    </svg>

    <div
      v-for="(m, i) in mascots"
      :key="m.path"
      class="mascot"
      :style="{ 'left': `${m.spot.left}%`, 'bottom': `${m.spot.bottom}px`, 'width': `${m.spot.size}px`, '--i': i, 'backgroundImage': `url('${m.thumb}')` }"
      :title="m.name"
    />

    <svg class="hills" viewBox="0 0 1200 160" preserveAspectRatio="none">
      <path class="h1" d="M0 90C150 40 300 60 460 80S780 30 960 60 1140 90 1200 70V160H0z" />
      <path class="h2" d="M0 120C180 80 320 110 520 104S860 70 1040 100 1160 118 1200 110V160H0z" />
      <path class="h3" d="M0 140C200 124 420 146 640 134S1000 124 1200 138V160H0z" />
    </svg>
  </div>
</template>

<style scoped>
.meadow {
  position: fixed;
  inset: 0;
  z-index: var(--z-background);
  overflow: hidden;
  pointer-events: none;
}
.hills {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 150px;
}
.h1 {
  fill: #9fd48a;
}
.h2 {
  fill: #6fbf5c;
}
.h3 {
  fill: #4a9c45;
}
:global(html.dark) .h1 {
  fill: #20452f;
}
:global(html.dark) .h2 {
  fill: #183a28;
}
:global(html.dark) .h3 {
  fill: #0f2a1d;
}
/* A mascot in its bubble: its card's illustration window, framed round. */
.mascot {
  position: absolute;
  aspect-ratio: 1;
  border: 4px solid #fffdf6;
  border-radius: 50%;
  background-repeat: no-repeat;
  /* The card is 63 × 88: its art sits under the name, in the upper half. */
  background-size: 190% auto;
  /* Centred on the illustration window (11–47 % of the card's height). */
  background-position: 50% 16%;
  box-shadow:
    0 0 0 2px rgba(27, 29, 42, 0.12),
    0 10px 22px -8px rgba(27, 29, 42, 0.45);
  translate: -50% 0;
  animation: bob 3.6s ease-in-out infinite alternate;
  animation-delay: calc(var(--i) * -0.7s);
  opacity: 0.92;
}
:global(html.dark) .mascot {
  border-color: #2b3452;
  opacity: 0.8;
}
@keyframes bob {
  from {
    transform: translateY(0) rotate(-2deg);
  }
  to {
    transform: translateY(-10px) rotate(2deg);
  }
}
.ball {
  position: absolute;
  left: -40px;
  opacity: 0.28;
  animation: drift linear infinite;
}
@keyframes drift {
  from {
    transform: translateX(0) rotate(0deg);
  }
  to {
    transform: translateX(calc(100vw + 80px)) rotate(720deg);
  }
}
@media (max-width: 700px) {
  .mascot:nth-child(n + 7) {
    display: none;
  }
  .hills {
    height: 100px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mascot,
  .ball {
    animation: none;
  }
  .ball {
    display: none;
  }
}
</style>
