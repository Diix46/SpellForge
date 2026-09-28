<script setup lang="ts">
import type { LandingWorld } from '#shared/landing'
import { GAME_LIST } from '#shared/game'

// The five worlds side by side, filling the screen: five slanted columns,
// each filing its own cards past (HeroWorld). The words sit at the top, over
// a shade that lets the cards show through; a column is the door to its
// library.
defineProps<{ worlds: LandingWorld[] }>()

const { t } = useLocale()
</script>

<template>
  <section class="hero">
    <nav class="worlds" :aria-label="t('home.gallery.kicker')">
      <LandingHeroWorld v-for="(w, i) in worlds" :key="w.game" :world="w" :index="i" />
    </nav>

    <div class="words">
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
  </section>
</template>

<style scoped>
.hero {
  --slant: 56px;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: max(700px, calc(100svh - 64px));
  overflow: hidden;
  isolation: isolate;
  background: #09090d;
  color: #f6f4ee;
}

/* ---- the five worlds, the whole height ---- */
.worlds {
  position: absolute;
  z-index: 0;
  inset: 0 calc(var(--slant) * -1);
  display: flex;
}

/* ---- the words, over a shade the cards show through ---- */
.words {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: clamp(48px, 9vh, 110px) clamp(16px, 4vw, 48px) 150px;
  background: linear-gradient(180deg, rgba(9, 9, 13, 0.94) 0%, rgba(9, 9, 13, 0.82) 55%, rgba(9, 9, 13, 0) 100%);
  text-align: center;
  /* The columns under the shade stay clickable, except where the words are. */
  pointer-events: none;
}
.words > * {
  pointer-events: auto;
}
.games {
  margin: 0;
  color: rgba(246, 244, 238, 0.66);
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
  /* The five worlds' colours, in their order. */
  background: linear-gradient(90deg, #ef5a4c, #6f9fe0, #f0c43a, #9a6ad8, #2fb3c4);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: none;
  filter: drop-shadow(0 6px 30px rgba(0, 0, 0, 0.5));
}
.sub {
  max-width: 60ch;
  margin: 0;
  color: rgba(246, 244, 238, 0.86);
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
.cta:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 3px;
}
.cta--light {
  background: #f6f4ee;
  color: #09090d;
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.8);
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

/* ---- narrow screens: the words, then a band per world ---- */
@media (max-width: 760px) {
  .hero {
    min-height: 0;
  }
  .worlds {
    position: static;
    order: 1;
    flex-direction: column;
  }
  .words {
    padding: 40px 16px 36px;
    background: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cta {
    transition: none;
  }
}
</style>
