<script setup lang="ts">
import type { ShowcaseArt } from '~~/server/api/tcg/[game]/showcase.get'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// Yu-Gi-Oh backdrop, Master Duel style: the duel field in perspective at the
// foot of the page — Extra Monster, Monster and Spell & Trap zones lined in
// gold, the zones' cyan light running across them — and, high behind it, a
// legendary monster's own art (the showcase's art crops), a new one every
// half-minute. Fixed, behind everything; still under reduced motion.
const { locale } = useLocale()
const { data } = useFetch<{ arts: ShowcaseArt[] }>('/api/tcg/yugioh/showcase', {
  query: computed(() => ({ lang: locale.value })),
  server: false,
  lazy: true,
  default: () => ({ arts: [] }),
})
const arts = computed(() => (data.value?.arts ?? []).filter(a => !a.card))
const index = ref(0)
const shown = computed(() => arts.value[index.value % Math.max(1, arts.value.length)] ?? null)

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  timer = setInterval(() => (index.value += 1), 30_000)
})
onBeforeUnmount(() => clearInterval(timer))

// The field: two Extra Monster Zones, then five Monster and five Spell & Trap
// zones, the Field Zone and the Deck at the ends.
const ROWS = [
  { kind: 'extra', cells: [null, 'm', null, 'm', null] },
  { kind: 'monster', cells: ['m', 'm', 'm', 'm', 'm'] },
  { kind: 'spell', cells: ['s', 's', 's', 's', 's'] },
] as const
</script>

<template>
  <div class="field-bg" aria-hidden="true">
    <Transition name="art">
      <img v-if="shown" :key="shown.image" :src="shown.image" alt="" class="art">
    </Transition>
    <div class="rays" />
    <div class="board">
      <div class="grid">
        <span class="side side--l">
          <i class="zone zone--field" />
          <i class="zone zone--gy" />
        </span>
        <div class="rows">
          <div v-for="(row, r) in ROWS" :key="row.kind" class="row" :class="`row--${row.kind}`">
            <i v-for="(c, k) in row.cells" :key="k" class="zone" :class="c ? `zone--${c}` : 'zone--none'" :style="{ '--d': `${(r * 5 + k) * 0.18}s` }" />
          </div>
        </div>
        <span class="side side--r">
          <i class="zone zone--extra-deck" />
          <i class="zone zone--deck" />
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.field-bg {
  position: fixed;
  inset: 0;
  z-index: var(--z-background);
  overflow: hidden;
  pointer-events: none;
}
/* The monster over the field, fading into the night on every side. */
.art {
  position: absolute;
  top: -4vh;
  left: 50%;
  width: min(62vw, 760px);
  aspect-ratio: 1;
  object-fit: cover;
  translate: -50% 0;
  opacity: 0.2;
  filter: saturate(1.1) contrast(1.05);
  -webkit-mask-image: radial-gradient(closest-side, #000 45%, transparent 100%);
  mask-image: radial-gradient(closest-side, #000 45%, transparent 100%);
}
.art-enter-active,
.art-leave-active {
  transition: opacity 2.4s ease;
}
.art-enter-from,
.art-leave-to {
  opacity: 0;
}
/* Light falling on the field from the arena's top. */
.rays {
  position: absolute;
  inset: 0;
  background:
    conic-gradient(
      from 180deg at 50% -20%,
      transparent 160deg,
      rgba(79, 195, 247, 0.08) 172deg,
      transparent 176deg,
      rgba(79, 195, 247, 0.06) 184deg,
      transparent 190deg,
      rgba(212, 175, 55, 0.05) 196deg,
      transparent 204deg
    ),
    linear-gradient(180deg, transparent 55%, rgba(7, 11, 26, 0.6));
}
.board {
  position: absolute;
  left: 50%;
  bottom: -8vh;
  width: min(1200px, 130vw);
  translate: -50% 0;
  perspective: 900px;
}
.grid {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 2.2%;
  padding: 2.4%;
  border: 1px solid rgba(212, 175, 55, 0.35);
  background: radial-gradient(80% 90% at 50% 40%, rgba(28, 60, 140, 0.35), rgba(7, 11, 26, 0.2));
  transform: rotateX(58deg);
  transform-origin: 50% 100%;
  box-shadow:
    0 0 60px rgba(79, 195, 247, 0.15),
    inset 0 0 40px rgba(79, 195, 247, 0.12);
}
.rows {
  display: grid;
  gap: 5%;
}
.row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 3%;
}
.side {
  display: grid;
  align-content: space-between;
  gap: 12%;
  width: 9vw;
  max-width: 110px;
}
.zone {
  display: block;
  aspect-ratio: 59 / 86;
  border: 1.5px solid rgba(212, 175, 55, 0.55);
  background: rgba(79, 195, 247, 0.04);
  box-shadow: inset 0 0 14px rgba(79, 195, 247, 0.1);
  animation: zone 5.4s ease-in-out infinite;
  animation-delay: var(--d, 0s);
}
.zone--none {
  visibility: hidden;
}
.zone--s {
  border-color: rgba(79, 195, 247, 0.45);
}
.row--extra .zone--m {
  border-style: dashed;
}
.zone--field {
  border-color: rgba(79, 195, 247, 0.6);
}
/* The cyan light running across the zones, one after the other. */
@keyframes zone {
  0%,
  70%,
  100% {
    background: rgba(79, 195, 247, 0.04);
    box-shadow: inset 0 0 14px rgba(79, 195, 247, 0.1);
  }
  82% {
    background: rgba(79, 195, 247, 0.16);
    box-shadow:
      inset 0 0 22px rgba(79, 195, 247, 0.35),
      0 0 22px rgba(79, 195, 247, 0.35);
  }
}
@media (max-width: 700px) {
  .art {
    width: 110vw;
    opacity: 0.16;
  }
  .board {
    width: 170vw;
  }
}
@media (prefers-reduced-motion: reduce) {
  .zone {
    animation: none;
  }
}
</style>
