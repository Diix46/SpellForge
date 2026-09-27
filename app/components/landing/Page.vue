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
      <LandingFinale />
    </main>
    <LandingFooter />
  </div>
</template>

<style scoped>
.home {
  min-height: 100vh;
  background: #f2f2ef;
  overflow-x: clip;
}
</style>
