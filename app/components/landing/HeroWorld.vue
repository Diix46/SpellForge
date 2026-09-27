<script setup lang="ts">
import type { LandingWorld } from '#shared/landing'
import { computed } from 'vue'
import { GAMES, libraryPath } from '#shared/game'
import { lookVars, WORLD_LOOK } from '~/utils/landing/looks'

// One world's column at the foot of the hero: its cards filing past in two
// rows going opposite ways, its name in the face its cards are set in, its
// size. The whole column is the door to its library; hovered, it widens.
const props = defineProps<{ world: LandingWorld, index: number }>()

const { t, locale } = useLocale()
const def = computed(() => GAMES[props.world.game])
const look = computed(() => WORLD_LOOK[props.world.game])
const count = computed(() => props.world.cards.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US'))
// Two rows of cards, each twice over so the loop never shows a seam.
const rows = computed(() => {
  const cards = props.world.strip.length ? props.world.strip : props.world.fan
  const a = cards.filter((_, i) => i % 2 === 0)
  const b = cards.filter((_, i) => i % 2 === 1)
  return [a, b.length ? b : a].map(r => [...r, ...r])
})
</script>

<template>
  <NuxtLink
    :to="libraryPath(world.game)"
    class="world"
    :style="{ ...lookVars(world.game), '--swatch': def.swatch, '--i': index }"
  >
    <span class="strip" aria-hidden="true">
      <span v-for="(row, r) in rows" :key="r" class="row" :class="`row--${r}`">
        <img
          v-for="(c, k) in row"
          :key="k"
          :src="c.image"
          alt=""
          class="card"
          :loading="k < row.length / 2 ? 'eager' : 'lazy'"
          decoding="async"
          fetchpriority="low"
          draggable="false"
        >
      </span>
    </span>
    <span class="label">
      <span class="name" :class="{ upper: look.upper }">{{ def.label }}</span>
      <span v-if="world.cards" class="count"><strong>{{ count }}</strong> {{ t('home.gallery.cards') }}</span>
      <span class="enter">
        {{ t('home.gallery.library') }}
        <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
      </span>
    </span>
  </NuxtLink>
</template>

<style scoped>
.world {
  position: relative;
  display: block;
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  background: var(--bg);
  color: var(--ink);
  text-decoration: none;
  /* A slanted pane of the prism's light; its neighbours overlap under the slant. */
  clip-path: polygon(var(--slant) 0, 100% 0, calc(100% - var(--slant)) 100%, 0 100%);
  transition: flex-grow 0.6s cubic-bezier(0.2, 0.9, 0.25, 1);
  animation: world-in 0.8s cubic-bezier(0.2, 0.9, 0.25, 1) both;
  animation-delay: calc(0.15s + var(--i) * 80ms);
}
.world + .world {
  margin-left: calc(var(--slant) * -1 + 4px);
}
.world:hover,
.world:focus-visible {
  flex-grow: 1.7;
}
.world:focus-visible {
  outline: none;
}
.world:focus-visible .name {
  text-decoration: underline;
  text-underline-offset: 6px;
}
/* Where the ray lands: a line of the world's colour along the top. */
.world::before {
  content: '';
  position: absolute;
  z-index: 2;
  inset: 0 0 auto;
  height: 3px;
  background: var(--swatch);
  box-shadow: 0 0 18px 2px var(--swatch);
}
@keyframes world-in {
  from {
    opacity: 0;
    translate: 0 40px;
  }
}

/* ---- the cards filing past ---- */
.strip {
  position: absolute;
  inset: -20px 0 0;
  display: flex;
  justify-content: center;
  gap: 12px;
  padding-inline: 12px;
  opacity: 0.78;
  transition: opacity 0.5s ease;
}
.world:hover .strip {
  opacity: 1;
}
.row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(190px, 44%);
  flex-shrink: 0;
  animation: file 70s linear infinite;
}
.row--1 {
  margin-top: -90px;
  animation-direction: reverse;
  animation-duration: 84s;
}
.card {
  display: block;
  width: 100%;
  aspect-ratio: 63 / 88;
  object-fit: cover;
  border-radius: 5%/3.6%;
  background: color-mix(in srgb, var(--ink) 10%, transparent);
  box-shadow: 0 14px 26px -12px rgba(0, 0, 0, 0.75);
  -webkit-user-drag: none;
}
@keyframes file {
  to {
    translate: 0 -50%;
  }
}

/* ---- the name, over a shade of the world's own ground ---- */
.label {
  position: absolute;
  z-index: 1;
  inset: auto 0 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 90px calc(var(--slant) + 14px) 22px calc(var(--slant) * 0.35 + 18px);
  background: linear-gradient(
    0deg,
    color-mix(in srgb, var(--accent) 12%, #07070b) 0%,
    rgba(7, 7, 11, 0.82) 42%,
    transparent 100%
  );
  color: #f6f4ee;
}
/* The first world starts past the screen's edge, by the slant. */
.world:first-child .label {
  padding-left: calc(var(--slant) + 20px);
}
.name {
  font-family: var(--face);
  font-size: clamp(22px, 2vw, 32px);
  font-weight: var(--weight);
  line-height: 1;
  white-space: nowrap;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
}
.name.upper {
  text-transform: uppercase;
}
.count {
  color: rgba(246, 244, 238, 0.72);
  font-size: 13px;
  white-space: nowrap;
}
.count strong {
  color: color-mix(in srgb, var(--swatch) 45%, #ffffff);
  font-variant-numeric: tabular-nums;
}
.enter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-height: 0;
  margin-top: 0;
  overflow: hidden;
  color: var(--accent);
  font-size: 14px;
  font-weight: 600;
  opacity: 0;
  transition:
    max-height 0.4s ease,
    margin-top 0.4s ease,
    opacity 0.4s ease;
}
.world:hover .enter,
.world:focus-visible .enter {
  max-height: 24px;
  margin-top: 6px;
  opacity: 1;
}

/* ---- narrow screens: a band per world, stacked ---- */
@media (max-width: 760px) {
  .world {
    flex: none;
    height: 92px;
    clip-path: none;
  }
  .world + .world {
    margin-left: 0;
  }
  .world::before {
    inset: 0 auto 0 0;
    width: 4px;
    height: auto;
  }
  .strip {
    inset: 0 0 0 45%;
    align-items: center;
    justify-content: flex-start;
  }
  .row {
    flex-direction: row;
    width: auto;
    height: 76px;
    animation: none;
  }
  .row--1 {
    display: none;
  }
  .card {
    width: auto;
    height: 100%;
  }
  .label,
  .world:first-child .label {
    inset: 0 auto 0 0;
    justify-content: center;
    width: 60%;
    padding: 0 16px 0 20px;
    background: linear-gradient(90deg, rgba(7, 7, 11, 0.92) 55%, transparent);
  }
  .enter {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .world,
  .row {
    animation: none;
  }
  .world,
  .enter {
    transition: none;
  }
}
</style>
