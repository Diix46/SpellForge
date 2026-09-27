<script setup lang="ts">
// Pokémon backdrop: a meadow at the foot of the page, and Pokémon living in
// it — Pikachu, Eevee, Charmander… running through the grass, their feet
// hidden in it; Mew, Charizard, Butterfree flying a little above. Their 3D
// models (Pokémon HOME's renders, via /api/images/sprites), bounding along or
// gliding, in a shadow of their own. Night falls on
// the meadow in dark mode. Fixed, behind everything; still under reduced
// motion (they stand in the grass).

// Runners: dex number, seconds to cross, delay, height over the grass, way.
const RUNNERS = [
  { id: 25, dur: 22, delay: 0, lift: 34, right: true },
  { id: 133, dur: 28, delay: -9, lift: 26, right: false },
  { id: 4, dur: 26, delay: -17, lift: 30, right: true },
  { id: 1, dur: 34, delay: -4, lift: 20, right: false },
  { id: 7, dur: 30, delay: -23, lift: 28, right: true },
  { id: 58, dur: 24, delay: -13, lift: 24, right: false },
]
// Fliers: a slower crossing, higher up, drifting up and down.
const FLIERS = [
  { id: 151, dur: 46, delay: -6, lift: 170, right: true },
  { id: 6, dur: 38, delay: -30, lift: 230, right: false },
  { id: 12, dur: 52, delay: -18, lift: 125, right: false },
]
const sprite = (id: number) => `/api/images/sprites/${id}.webp`
</script>

<template>
  <div class="meadow" aria-hidden="true">
    <svg class="hills hills--back" viewBox="0 0 1200 160" preserveAspectRatio="none">
      <path class="h1" d="M0 90C150 40 300 60 460 80S780 30 960 60 1140 90 1200 70V160H0z" />
      <path class="h2" d="M0 120C180 80 320 110 520 104S860 70 1040 100 1160 118 1200 110V160H0z" />
    </svg>

    <div
      v-for="(p, i) in [...FLIERS, ...RUNNERS]"
      :key="p.id"
      class="mon"
      :class="{ right: p.right, flier: p.lift > 100 }"
      :style="{ 'bottom': `${p.lift}px`, 'animationDuration': `${p.dur}s`, 'animationDelay': `${p.delay}s`, '--i': i }"
    >
      <img :src="sprite(p.id)" alt="" loading="lazy" decoding="async">
    </div>

    <!-- The front grass, over the runners' feet. -->
    <svg class="hills hills--front" viewBox="0 0 1200 60" preserveAspectRatio="none">
      <path class="h3" d="M0 30C60 18 90 34 140 24S230 12 290 26 380 34 440 22 540 14 600 26 700 34 760 22 860 14 920 26 1020 34 1080 22 1160 16 1200 26V60H0z" />
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
}
.hills--back {
  height: 150px;
}
.hills--front {
  height: 52px;
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
/* A Pokémon crossing the page, bounding on the way. */
.mon {
  position: absolute;
  left: 0;
  animation: cross linear infinite;
  animation-direction: reverse;
}
.mon.right {
  animation-direction: normal;
}
.mon img {
  display: block;
  width: 104px;
  height: 104px;
  object-fit: contain;
  transform-origin: 50% 90%;
  filter: drop-shadow(0 6px 5px rgba(20, 50, 20, 0.35));
  animation: hop 0.38s cubic-bezier(0.3, 0, 0.5, 1) infinite alternate;
}
/* The renders face left: those going right turn round. */
.mon.right img {
  scale: -1 1;
}
.flier img {
  width: 92px;
  height: 92px;
  filter: drop-shadow(0 26px 10px rgba(20, 50, 20, 0.22));
  animation: drift 3.2s ease-in-out infinite alternate;
}
:global(html.dark) .mon img {
  filter: brightness(0.78) saturate(0.9) drop-shadow(0 6px 5px rgba(0, 0, 0, 0.45));
}
@keyframes cross {
  from {
    transform: translateX(-120px);
  }
  to {
    transform: translateX(calc(100vw + 120px));
  }
}
/* A stride: pushed off, leaning forward, then landing a little squashed. */
@keyframes hop {
  from {
    transform: translateY(0) rotate(0deg) scale(1.03, 0.97);
  }
  to {
    transform: translateY(-12px) rotate(-4deg) scale(0.98, 1.02);
  }
}
@keyframes drift {
  from {
    transform: translateY(0) rotate(-2deg);
  }
  to {
    transform: translateY(-26px) rotate(3deg);
  }
}
@media (max-width: 700px) {
  .mon:nth-child(n + 7) {
    display: none;
  }
  .hills--back {
    height: 100px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mon,
  .mon img {
    animation: none;
  }
  .mon {
    transform: translateX(calc(var(--i, 1) * 10vw));
  }
}
</style>
