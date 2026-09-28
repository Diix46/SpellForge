<script setup lang="ts">
import type { LandingOverview, LandingWorld } from '#shared/landing'
import { computed } from 'vue'

// The home page, the same for everyone and rendered by the server: the
// prism and its five worlds, the figures of every world, one search for all
// of them, the gallery of worlds, then the way in. Every section reads real
// data (the card databases, the Discover gallery).
const { data: overview } = useFetch<LandingOverview>('/api/landing/overview', {
  default: () => ({ stats: { optcgCards: 0, optcgArts: 0, mtgCards: 0, publicDecks: 0 }, decks: [] }),
})
const stats = computed(() => overview.value?.stats ?? { optcgCards: 0, optcgArts: 0, mtgCards: 0, publicDecks: 0 })
const decks = computed(() => overview.value?.decks ?? [])
const { locale } = useLocale()
const { data: worldsData } = useFetch<{ worlds: LandingWorld[] }>('/api/landing/worlds', {
  query: computed(() => ({ lang: locale.value })),
  default: () => ({ worlds: [] }),
})
const worlds = computed(() => worldsData.value?.worlds ?? [])
</script>

<template>
  <div class="home">
    <main>
      <LandingHero :worlds="worlds" />
      <LandingNumbers :stats="stats" :worlds="worlds" />
      <LandingOmniSearch />
      <LandingGallery :worlds="worlds" />
      <LandingJourney />
      <LandingShowcase v-if="decks.length" :decks="decks" />
      <LandingFinale :worlds="worlds" />
    </main>
    <LandingFooter />
  </div>
</template>

<style scoped>
.home {
  /* The landing's own palette for its paper sections, by day and by night
     (the hero, the journey and the finale are night in both). */
  --l-bg: #f2f2ef;
  --l-bg-2: #eceeea;
  --l-panel: #ffffff;
  --l-ink: #1b1f22;
  --l-mid: #454d52;
  --l-muted: #616a6f;
  --l-line: rgba(27, 31, 34, 0.14);
  --l-line-strong: rgba(27, 31, 34, 0.3);
  --l-chip: #1b1f22;
  --l-chip-ink: #f7f7f5;
  --l-empty: #e2e4e0;
  /* One rhythm for every section: the same breath above and below, the same
     side gutter, the same content width. */
  --l-section: clamp(64px, 7vw, 96px);
  --l-gutter: clamp(16px, 5vw, 80px);
  --l-width: 1320px;
  /* Between a section's heading and what it shows. */
  --l-head-gap: 40px;
  min-height: 100vh;
  background: var(--l-bg);
  color: var(--l-ink);
  overflow-x: clip;
}
html.dark .home {
  --l-bg: #0e0e12;
  --l-bg-2: #131318;
  --l-panel: #1b1b22;
  --l-ink: #f1efe9;
  --l-mid: #c2c0b9;
  --l-muted: #97958f;
  --l-line: rgba(255, 255, 255, 0.1);
  --l-line-strong: rgba(255, 255, 255, 0.28);
  --l-chip: #f1efe9;
  --l-chip-ink: #0e0e12;
  --l-empty: #23232b;
}
</style>
