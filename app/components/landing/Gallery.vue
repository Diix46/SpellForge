<script setup lang="ts">
import type { GameId } from '#shared/game'
import type { LandingWorld } from '#shared/landing'
import { computed } from 'vue'
import { collectionPath, GAMES, libraryPath } from '#shared/game'

// The gallery of worlds: one door per game, each dressed in its own light —
// its colours, its type, its texture — with a fan of its cards, its deck rule
// and its size. The doors lead to the library, a new deck, the collection.
const props = defineProps<{ worlds: LandingWorld[] }>()
const { t, locale } = useLocale()

/** Each world's look on the landing (the universes' own tokens live on their pages). */
const LOOK: Record<GameId, { bg: string, ink: string, muted: string, accent: string, onAccent: string, face: string, weight: number, upper: boolean }> = {
  optcg: { bg: 'linear-gradient(160deg, #f4e4c3, #e6cf9f)', ink: '#231708', muted: '#5e472c', accent: '#c9312a', onAccent: '#fff8ec', face: '\'Anton\', Impact, sans-serif', weight: 400, upper: true },
  mtg: { bg: 'linear-gradient(160deg, #1d2530, #0f1318)', ink: '#eef0f1', muted: '#a9b3ba', accent: '#7aa0d4', onAccent: '#0f1318', face: '\'Philosopher\', Georgia, serif', weight: 700, upper: false },
  pokemon: { bg: 'linear-gradient(160deg, #fff7d6, #ffe07a)', ink: '#1b1d2a', muted: '#4a4d5e', accent: '#d6342e', onAccent: '#ffffff', face: '\'Cabin\', ui-sans-serif, sans-serif', weight: 700, upper: false },
  yugioh: { bg: 'radial-gradient(120% 80% at 50% 0%, #1b2f6b, #070b1a 70%)', ink: '#eef1fb', muted: '#aab3d4', accent: '#d4af37', onAccent: '#140f04', face: '\'Enriqueta\', Georgia, serif', weight: 700, upper: true },
  riftbound: { bg: 'radial-gradient(120% 80% at 50% 0%, #0a323c, #010a13 70%)', ink: '#f0e6d2', muted: '#a09b8c', accent: '#c8aa6e', onAccent: '#010a13', face: 'var(--rift-face)', weight: 700, upper: true },
}

const list = computed(() => props.worlds.filter(w => GAMES[w.game]).map(w => ({ ...w, def: GAMES[w.game], look: LOOK[w.game] })))
const fmt = (n: number) => n.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US')
</script>

<template>
  <section id="gallery" class="gallery" aria-labelledby="gallery-title">
    <header class="head">
      <p class="kicker">
        {{ t('home.gallery.kicker') }}
      </p>
      <h2 id="gallery-title" class="title">
        {{ t('home.gallery.title') }}
      </h2>
      <p class="sub">
        {{ t('home.gallery.sub') }}
      </p>
    </header>

    <ul class="grid">
      <li
        v-for="(w, i) in list"
        :key="w.game"
        class="world"
        :style="{ '--bg': w.look.bg, '--ink': w.look.ink, '--muted': w.look.muted, '--accent': w.look.accent, '--on-accent': w.look.onAccent, '--face': w.look.face, '--weight': w.look.weight, '--i': i }"
      >
        <div class="fan" aria-hidden="true">
          <NuxtLink v-for="(c, k) in w.fan" :key="c.path" :to="c.path" class="fan-card" :style="{ '--k': k, '--n': w.fan.length }" tabindex="-1">
            <img :src="c.image" :alt="c.name" loading="lazy" decoding="async" @error="($event.target as HTMLElement).parentElement!.hidden = true">
          </NuxtLink>
        </div>
        <div class="body">
          <p class="name" :class="{ upper: w.look.upper }">
            {{ w.def.label }}
          </p>
          <p class="tagline">
            {{ t(`home.gallery.${w.game}`) }}
          </p>
          <p class="rule">
            <UIcon name="i-lucide-scroll-text" class="h-3.5 w-3.5 shrink-0" />
            {{ t(`modal.world.${w.game}`) }}
          </p>
          <p v-if="w.cards" class="count">
            <strong>{{ fmt(w.cards) }}</strong> {{ t('home.gallery.cards') }}
          </p>
          <div class="doors">
            <NuxtLink :to="libraryPath(w.game)" class="door door--main">
              {{ t('home.gallery.library') }}
              <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
            </NuxtLink>
            <NuxtLink :to="`/decks?new=${w.game}`" class="door">
              {{ t('home.gallery.newDeck') }}
            </NuxtLink>
            <NuxtLink :to="collectionPath(w.game)" class="door">
              {{ t('home.gallery.collection') }}
            </NuxtLink>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.gallery {
  padding: 96px clamp(16px, 4vw, 56px) 110px;
  background: #f2f2ef;
}
.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 720px;
  margin: 0 auto 48px;
  text-align: center;
}
.kicker {
  margin: 0;
  padding: 3px 10px;
  border-radius: 999px;
  background: #1b1f22;
  color: #f7f7f5;
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.title {
  margin: 0;
  font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(34px, 4.6vw, 58px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  color: #1b1f22;
}
.sub {
  margin: 0;
  color: #454d52;
  font-size: 16px;
  line-height: 1.55;
  text-wrap: balance;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
  gap: 18px;
  max-width: 1400px;
  margin: 0 auto;
  padding: 0;
  list-style: none;
}
.world {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 20px;
  background: var(--bg);
  color: var(--ink);
  box-shadow: 0 30px 60px -34px rgba(0, 0, 0, 0.55);
  animation: world-in 0.7s cubic-bezier(0.2, 0.9, 0.25, 1) both;
  animation-delay: calc(var(--i) * 70ms);
  transition:
    transform 0.4s cubic-bezier(0.2, 0.9, 0.25, 1),
    box-shadow 0.4s ease;
}
.world:hover {
  transform: translateY(-6px);
  box-shadow: 0 40px 70px -30px rgba(0, 0, 0, 0.6);
}
@keyframes world-in {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
}

/* Three cards fanned out, spreading when the world is hovered. */
.fan {
  position: relative;
  height: 230px;
  margin-top: 18px;
}
.fan-card {
  --spread: 34px;
  --turn: 8deg;
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 124px;
  aspect-ratio: 63 / 88;
  overflow: hidden;
  border-radius: 6px;
  box-shadow: 0 14px 26px -12px rgba(0, 0, 0, 0.7);
  transform-origin: 50% 110%;
  translate: calc(-50% + (var(--k) - (var(--n) - 1) / 2) * var(--spread)) 0;
  rotate: calc((var(--k) - (var(--n) - 1) / 2) * var(--turn));
  transition:
    translate 0.5s cubic-bezier(0.2, 0.9, 0.25, 1),
    rotate 0.5s cubic-bezier(0.2, 0.9, 0.25, 1);
}
.world:hover .fan-card {
  --spread: 62px;
  --turn: 13deg;
}
.fan-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 22px 22px 22px;
}
.name {
  margin: 0;
  font-family: var(--face);
  font-size: 30px;
  font-weight: var(--weight);
  line-height: 1;
}
.name.upper {
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.tagline {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--muted);
}
.rule {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 12.5px;
  color: var(--ink);
}
.count {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted);
}
.count strong {
  font-family: 'Geist Mono', ui-monospace, monospace;
  font-size: 15px;
  color: var(--accent);
}
.doors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
}
.door {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid color-mix(in srgb, var(--ink) 25%, transparent);
  border-radius: 999px;
  font-size: 13px;
  color: var(--ink);
  text-decoration: none;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}
.door:hover {
  border-color: var(--accent);
}
.door--main {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
}
.door:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .world,
  .fan-card {
    animation: none;
    transition: none;
  }
}
</style>
