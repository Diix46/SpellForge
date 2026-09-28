<script setup lang="ts">
import type { LandingWorld } from '#shared/landing'
import { computed } from 'vue'
import { GAMES, libraryPath } from '#shared/game'
import { WORLD_LOOK } from '~/utils/landing/looks'

// The last word, kept quiet: the question, and a door to each world — one of
// its most sought-after cards, its name in the face its cards are set in.
// One hover effect: the door's edge takes the world's colour.
const props = defineProps<{ worlds: LandingWorld[] }>()
const { t } = useLocale()
const doors = computed(() => props.worlds.filter(w => GAMES[w.game]).map(w => ({ ...w, def: GAMES[w.game], look: WORLD_LOOK[w.game], card: w.fan[0] ?? null })))
</script>

<template>
  <section class="finale">
    <header class="head">
      <h2 class="title">
        {{ t('home.finale.title') }}
      </h2>
      <p class="sub">
        {{ t('home.finale.sub') }}
      </p>
    </header>
    <nav class="doors" :aria-label="t('home.gallery.kicker')">
      <NuxtLink
        v-for="d in doors"
        :key="d.game"
        :to="libraryPath(d.game)"
        class="door"
        :style="{ '--swatch': d.def.swatch, '--face': d.look.face, '--weight': d.look.weight }"
      >
        <span class="art">
          <img v-if="d.card" :src="d.card.image" alt="" loading="lazy" decoding="async">
        </span>
        <span class="name" :class="{ upper: d.look.upper }">{{ d.def.label }}</span>
        <span class="go">{{ t('home.gallery.library') }} <UIcon name="i-lucide-arrow-right" class="h-3.5 w-3.5" /></span>
      </NuxtLink>
    </nav>
  </section>
</template>

<style scoped>
.finale {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--l-head-gap);
  padding: var(--l-section) var(--l-gutter);
  background: #0b0b10;
  color: #f6f4ee;
}
.head {
  display: grid;
  gap: 10px;
  text-align: center;
}
.title {
  margin: 0;
  font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(32px, 4.2vw, 52px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.05;
}
.sub {
  margin: 0;
  color: rgba(246, 244, 238, 0.66);
  font-size: 16px;
}
.doors {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
  width: min(var(--l-width), 100%);
}
.door {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 22px 16px 18px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 16px;
  background: #14141b;
  color: #f6f4ee;
  text-decoration: none;
  transition: border-color var(--dur) var(--ease-out);
}
.door:hover,
.door:focus-visible {
  border-color: var(--swatch);
}
.art {
  display: block;
  width: min(130px, 80%);
  aspect-ratio: 63 / 88;
  margin-bottom: 6px;
  overflow: hidden;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 12px 24px -12px rgba(0, 0, 0, 0.8);
}
.art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.name {
  font-family: var(--face);
  font-size: 20px;
  font-weight: var(--weight);
  line-height: 1;
}
.name.upper {
  text-transform: uppercase;
}
.go {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: rgba(246, 244, 238, 0.6);
  font-size: 13px;
}
@media (max-width: 900px) {
  .doors {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
}
</style>
