<script setup lang="ts">
import type { LandingOverview } from '#shared/landing'
import { computed } from 'vue'

// The home page, the same for everyone and rendered by the server: two worlds
// split by one seam, from the hero down to the last door. Every section reads
// real data (the card databases, the Discover gallery).
const { mtg, optcg } = useLandingCards()
const { data: overview } = useFetch<LandingOverview>('/api/landing/overview', {
  default: () => ({ stats: { optcgCards: 0, optcgArts: 0, mtgCards: 0, publicDecks: 0 }, decks: [] }),
})
const stats = computed(() => overview.value?.stats ?? { optcgCards: 0, optcgArts: 0, mtgCards: 0, publicDecks: 0 })
const decks = computed(() => overview.value?.decks ?? [])
</script>

<template>
  <div class="home">
    <main>
      <LandingHero :posters="optcg" :cards="mtg" />
      <LandingNumbers :stats="stats" />
      <LandingOmniSearch />
      <LandingWorlds :posters="optcg" :cards="mtg" />
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
