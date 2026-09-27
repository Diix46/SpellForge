<script setup lang="ts">
import type { LandingWorld } from '#shared/landing'
import { GAME_LIST } from '#shared/game'

// The prism the site is named after: a beam of white light comes in, the
// prism splits it into five rays, and each ray lands on a world — five slanted
// columns at the foot of the screen, each filing its own cards past. The
// words sit in the light between prism and worlds; a column is the door to
// its library.
defineProps<{ worlds: LandingWorld[] }>()

const { t } = useLocale()
</script>

<template>
  <section class="hero">
    <!-- The light: in from the upper left, out in the worlds' five colours. -->
    <div class="beam-in" aria-hidden="true" />
    <svg class="rays" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient v-for="g in GAME_LIST" :id="`ray-${g.id}`" :key="g.id" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="g.swatch" stop-opacity="0.75" />
          <stop offset="0.55" :stop-color="g.swatch" stop-opacity="0.28" />
          <stop offset="1" :stop-color="g.swatch" stop-opacity="0.5" />
        </linearGradient>
      </defs>
      <polygon
        v-for="(g, i) in GAME_LIST"
        :key="g.id"
        class="ray"
        :style="{ '--i': i }"
        :points="`${497 + i * 1.5},0 ${503 + i * 1.5},0 ${(i + 1) * 200 - 14},1000 ${i * 200 + 14},1000`"
        :fill="`url(#ray-${g.id})`"
      />
    </svg>

    <div class="words">
      <svg class="prism" viewBox="0 0 80 72" aria-hidden="true">
        <defs>
          <linearGradient id="prism-glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.55" />
            <stop offset="1" stop-color="#ffffff" stop-opacity="0.08" />
          </linearGradient>
        </defs>
        <path d="M40 3 L77 69 L3 69 Z" fill="url(#prism-glass)" stroke="#fff" stroke-opacity="0.85" stroke-width="2" stroke-linejoin="round" />
        <path d="M40 3 L40 69" stroke="#fff" stroke-opacity="0.35" />
      </svg>
      <p class="games">
        {{ GAME_LIST.map(g => g.label).join(' · ') }}
      </p>
      <h1 class="headline">
        <span class="l1">{{ t('home.hero.l1') }}</span>
        <span class="l2">{{ t('home.hero.l2') }}</span>
      </h1>
      <p class="sub">
        {{ t('home.hero.sub') }}
      </p>
      <div class="ctas">
        <NuxtLink to="/decks" class="cta cta--light">
          <UIcon name="i-lucide-layers" class="h-5 w-5" />
          {{ t('home.hero.start') }}
        </NuxtLink>
        <NuxtLink to="#search" class="cta cta--ghost">
          <UIcon name="i-lucide-search" class="h-5 w-5" />
          {{ t('home.hero.search') }}
        </NuxtLink>
      </div>
    </div>

    <nav class="worlds" :aria-label="t('home.gallery.kicker')">
      <LandingHeroWorld v-for="(w, i) in worlds" :key="w.game" :world="w" :index="i" />
    </nav>
  </section>
</template>

<style scoped>
.hero {
  --slant: 56px;
  --worlds-h: clamp(280px, 38svh, 400px);
  /* Where the prism's centre sits, from the top of the section. */
  --apex: 78px;
  position: relative;
  display: grid;
  grid-template-rows: 1fr var(--worlds-h);
  min-height: max(760px, calc(100svh - 64px));
  overflow: hidden;
  isolation: isolate;
  background: radial-gradient(60% 45% at 50% 0%, rgba(255, 255, 255, 0.07), transparent 70%), #09090d;
  color: #f6f4ee;
}

/* ---- the light ---- */
.beam-in {
  position: absolute;
  z-index: 0;
  top: calc(var(--apex) - 3px);
  right: 50%;
  width: 70vw;
  height: 6px;
  transform-origin: 100% 50%;
  rotate: 14deg;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.85));
  filter: blur(1.5px);
  box-shadow: 0 0 24px 4px rgba(255, 255, 255, 0.25);
}
.rays {
  position: absolute;
  z-index: 0;
  top: var(--apex);
  bottom: var(--worlds-h);
  left: 0;
  width: 100%;
  height: calc(100% - var(--apex) - var(--worlds-h));
  filter: blur(3px);
  mix-blend-mode: screen;
}
.ray {
  animation: shimmer 6s ease-in-out infinite alternate;
  animation-delay: calc(var(--i) * -1.3s);
}
@keyframes shimmer {
  from {
    opacity: 0.55;
  }
  to {
    opacity: 1;
  }
}

/* ---- the words, in the light ---- */
.words {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: calc(var(--apex) - 36px) clamp(16px, 4vw, 48px) 40px;
  text-align: center;
}
.prism {
  width: 80px;
  height: 72px;
  margin-bottom: 4px;
  filter: drop-shadow(0 0 16px rgba(255, 255, 255, 0.45));
}
.games {
  margin: 0;
  color: rgba(246, 244, 238, 0.62);
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.headline {
  display: flex;
  flex-direction: column;
  margin: 0;
  font-family: 'Anton', Impact, sans-serif;
  font-size: clamp(48px, 6.2vw, 96px);
  font-weight: 400;
  line-height: 0.95;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  text-shadow: 0 6px 40px rgba(0, 0, 0, 0.6);
}
.l2 {
  /* The five worlds' colours, the way the prism spreads them. */
  background: linear-gradient(90deg, #ef5a4c, #f0c43a, #9a6ad8, #2fb3c4, #6f9fe0);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: none;
  filter: drop-shadow(0 6px 30px rgba(0, 0, 0, 0.5));
}
.sub {
  max-width: 60ch;
  margin: 0;
  color: rgba(246, 244, 238, 0.82);
  font-size: clamp(15px, 1.2vw, 17px);
  line-height: 1.55;
  text-wrap: balance;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.9);
}
.ctas {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 6px;
}
.cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 22px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition:
    transform 0.25s cubic-bezier(0.2, 0.9, 0.25, 1),
    box-shadow 0.25s ease,
    background 0.25s ease;
}
.cta:hover {
  transform: translateY(-2px);
}
.cta:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 3px;
}
/* White light: the prism's own colour. */
.cta--light {
  background: #f6f4ee;
  color: #09090d;
  box-shadow: 0 0 30px -6px rgba(255, 255, 255, 0.55);
}
.cta--light:hover {
  box-shadow: 0 0 40px -4px rgba(255, 255, 255, 0.75);
}
.cta--ghost {
  border: 1px solid rgba(246, 244, 238, 0.4);
  background: rgba(9, 9, 13, 0.55);
  color: #f6f4ee;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.cta--ghost:hover {
  border-color: rgba(246, 244, 238, 0.8);
}

/* ---- the five worlds ---- */
.worlds {
  position: relative;
  z-index: 1;
  display: flex;
  margin-inline: calc(var(--slant) * -1);
}

@media (max-width: 760px) {
  .hero {
    grid-template-rows: auto auto;
    min-height: 0;
  }
  .rays,
  .beam-in {
    display: none;
  }
  .words {
    padding-top: 40px;
    padding-bottom: 36px;
  }
  .worlds {
    flex-direction: column;
    margin-inline: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ray {
    animation: none;
  }
  .cta {
    transition: none;
  }
}
</style>
