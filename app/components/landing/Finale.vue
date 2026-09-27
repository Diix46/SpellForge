<script setup lang="ts">
import { GAME_LIST, libraryPath } from '#shared/game'
import { lookVars, WORLD_LOOK } from '~/utils/landing/looks'

// The last word: the prism once more, and a door to each of the five worlds,
// in its own colours and its cards' face.
const { t } = useLocale()
</script>

<template>
  <section class="finale">
    <div class="lit">
      <!-- The prism's five rays, each landing on its door. -->
      <svg class="rays" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        <polygon
          v-for="(g, i) in GAME_LIST"
          :key="g.id"
          :points="`${497 + i * 1.5},0 ${503 + i * 1.5},0 ${(i + 1) * 200 - 30},1000 ${i * 200 + 30},1000`"
          :fill="g.swatch"
        />
      </svg>
      <svg class="prism" viewBox="0 0 80 72" aria-hidden="true">
        <path d="M40 3 L77 69 L3 69 Z" fill="rgba(255,255,255,.14)" stroke="#fff" stroke-opacity=".85" stroke-width="2" stroke-linejoin="round" />
      </svg>
      <h2 class="title">
        {{ t('home.finale.title') }}
      </h2>
      <p class="sub">
        {{ t('home.finale.sub') }}
      </p>
    </div>
    <nav class="doors" :aria-label="t('home.gallery.kicker')">
      <NuxtLink
        v-for="g in GAME_LIST"
        :key="g.id"
        :to="libraryPath(g.id)"
        class="door"
        :style="{ ...lookVars(g.id), '--swatch': g.swatch }"
      >
        <span class="door-name" :class="{ upper: WORLD_LOOK[g.id].upper }">{{ g.label }}</span>
        <UIcon name="i-lucide-arrow-right" class="door-arrow" />
      </NuxtLink>
    </nav>
  </section>
</template>

<style scoped>
.finale {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: var(--l-section) var(--l-gutter);
  background: radial-gradient(50% 60% at 50% 0%, rgba(255, 255, 255, 0.08), transparent 70%), #09090d;
  color: #f6f4ee;
  text-align: center;
}
.lit {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: min(var(--l-width), 100%);
  padding-bottom: 36px;
}
.rays {
  position: absolute;
  z-index: 0;
  top: 29px;
  bottom: 0;
  left: 0;
  width: 100%;
  height: calc(100% - 29px);
  opacity: 0.32;
  filter: blur(4px);
  mix-blend-mode: screen;
}
.prism,
.title,
.sub {
  position: relative;
  z-index: 1;
}
.prism {
  width: 64px;
  height: 58px;
  filter: drop-shadow(0 0 14px rgba(255, 255, 255, 0.4));
}
.title {
  margin: 0;
  font-family: 'Anton', Impact, sans-serif;
  font-size: clamp(40px, 5vw, 72px);
  font-weight: 400;
  line-height: 1;
  text-transform: uppercase;
}
.sub {
  margin: 0;
  color: rgba(246, 244, 238, 0.72);
  font-size: 16px;
}
.doors {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  width: min(var(--l-width), 100%);
}
.door {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 22px 20px;
  overflow: hidden;
  border-radius: 14px;
  background: var(--bg);
  color: var(--ink);
  text-decoration: none;
  box-shadow:
    inset 0 3px 0 var(--swatch),
    0 24px 44px -26px var(--swatch);
  transition:
    transform 0.35s cubic-bezier(0.2, 0.9, 0.25, 1),
    box-shadow 0.35s ease;
}
.door:hover {
  transform: translateY(-4px);
  box-shadow:
    inset 0 3px 0 var(--swatch),
    0 30px 50px -22px var(--swatch);
}
.door:focus-visible {
  outline: 2px solid var(--swatch);
  outline-offset: 3px;
}
.door-name {
  font-family: var(--face);
  font-size: 22px;
  font-weight: var(--weight);
  line-height: 1;
  white-space: nowrap;
}
.door-name.upper {
  text-transform: uppercase;
}
.door-arrow {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: var(--accent);
  transition: translate 0.35s cubic-bezier(0.3, 1.5, 0.5, 1);
}
.door:hover .door-arrow {
  translate: 5px 0;
}
@media (max-width: 1000px) {
  .doors {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }
}
@media (prefers-reduced-motion: reduce) {
  .door,
  .door-arrow {
    transition: none;
  }
}
</style>
