<script setup lang="ts">
import type { ShowcaseArt } from '~~/server/api/tcg/[game]/showcase.get'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// Riftbound backdrop, the League of Legends client's home: a champion's
// splash across the top of the page — the champion of one of the game's
// Legends, in League's own splash art (sharp; its card's art otherwise) —
// dimmed and fading into hextech black, the
// next champion every twenty-five seconds; a gold filigree under the bar and
// hextech motes rising. Fixed, behind everything; still under reduced motion.
const { locale } = useLocale()
const { data } = useFetch<{ arts: ShowcaseArt[] }>('/api/tcg/riftbound/showcase', {
  query: computed(() => ({ lang: locale.value })),
  server: false,
  lazy: true,
  default: () => ({ arts: [] }),
})
const arts = computed(() => (data.value?.arts ?? []).map(a => ({ ...a, src: a.splash ?? a.image, wide: !!a.splash })))
const index = ref(0)
const shown = computed(() => arts.value[index.value % Math.max(1, arts.value.length)] ?? null)

let timer: ReturnType<typeof setInterval> | undefined
const still = ref(false)
onMounted(() => {
  still.value = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!still.value)
    timer = setInterval(() => (index.value += 1), 25_000)
})
onBeforeUnmount(() => clearInterval(timer))

// Motes: fixed positions and timings, so the server and the browser agree.
const MOTES = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${-((i * 1.7) % 14)}s`,
  duration: `${12 + (i % 7) * 2}s`,
  size: `${2 + (i % 3)}px`,
}))
</script>

<template>
  <div class="rift-bg" aria-hidden="true">
    <Transition name="splash">
      <div v-if="shown" :key="shown.src" class="splash" :class="{ wide: shown.wide }" :style="{ backgroundImage: `url('${shown.src}')` }" />
    </Transition>
    <div class="veil" />
    <div class="filigree" />
    <span v-for="(m, i) in (still ? [] : MOTES)" :key="i" class="mote" :style="{ 'left': m.left, 'animationDelay': m.delay, 'animationDuration': m.duration, '--s': m.size }" />
  </div>
</template>

<style scoped>
.rift-bg {
  position: fixed;
  inset: 0;
  z-index: var(--z-background);
  overflow: hidden;
  pointer-events: none;
  background: #010a13;
}
/* The card is portrait; its illustration fills its upper half: that part,
   widened to the page, is the splash. */
.splash {
  position: absolute;
  inset: 0 0 auto;
  height: 78vh;
  background-size: 118% auto;
  background-position: 50% 18%;
  background-repeat: no-repeat;
  opacity: 0.42;
  filter: saturate(1.15) contrast(1.05);
  -webkit-mask-image:
    linear-gradient(180deg, #000 0%, #000 45%, transparent 100%),
    linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(180deg, #000 0%, #000 45%, transparent 100%),
    linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent);
  mask-composite: intersect;
}
/* A splash art is already the scene: it covers the band, the figure centred. */
.splash.wide {
  background-size: cover;
  background-position: 50% 22%;
}
.splash-enter-active,
.splash-leave-active {
  transition: opacity 2.6s ease;
}
.splash-enter-from,
.splash-leave-to {
  opacity: 0;
}
/* Hextech black from the bottom up, a blue breath in the middle. */
.veil {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(70% 45% at 50% 38%, rgba(10, 200, 185, 0.07), transparent 70%),
    linear-gradient(
      180deg,
      rgba(1, 10, 19, 0.35) 0%,
      rgba(1, 10, 19, 0.15) 30%,
      rgba(1, 10, 19, 0.85) 72%,
      #010a13 100%
    );
}
/* A gold line under the top bar, brightest in the middle, as in the client. */
.filigree {
  position: absolute;
  top: 56px;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, #785a28 20%, #c8aa6e 50%, #785a28 80%, transparent);
  opacity: 0.8;
}
.mote {
  position: absolute;
  bottom: -10px;
  width: var(--s);
  height: var(--s);
  border-radius: 50%;
  background: #0ac8b9;
  box-shadow: 0 0 8px 2px rgba(10, 200, 185, 0.6);
  opacity: 0;
  animation: rise linear infinite;
}
.mote:nth-child(3n) {
  background: #cdfafa;
}
.mote:nth-child(4n) {
  background: #c8aa6e;
  box-shadow: 0 0 8px 2px rgba(200, 170, 110, 0.5);
}
@keyframes rise {
  0% {
    opacity: 0;
    transform: translate(0, 0);
  }
  12% {
    opacity: 0.7;
  }
  85% {
    opacity: 0.5;
  }
  100% {
    opacity: 0;
    transform: translate(3vw, -85vh);
  }
}
@media (max-width: 700px) {
  .splash {
    height: 60vh;
    background-size: auto 150%;
  }
}
</style>
