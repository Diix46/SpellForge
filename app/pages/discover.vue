<script setup lang="ts">
import type { GameId } from '#shared/game'
import type { DiscoverDeck } from '~/composables/useDiscoverFilters'
import { computed } from 'vue'
import { sharedPath } from '#shared/game'
import { useDiscoverFilters } from '~/composables/useDiscoverFilters'

interface DiscoverRow {
  name: string
  game: GameId
  raw: string
  ownerDisplayName: string
  createdAt: string | number
  updatedAt: string | number
  shareId: string
}

// The public gallery, rendered by the server (the decks are what a search
// engine should find here), dressed like "My decks": the commander's art or
// the Leader's WANTED poster. Every filter runs in the browser.
const { t } = useLocale()

usePublicSeo({
  title: () => t('discover.title'),
  description: () => t('discover.subtitle'),
})

const { data, status, error, refresh } = await useFetch<{ decks: DiscoverRow[] }>('/api/decks/discover')
const time = (v: string | number) => (typeof v === 'number' ? v : Date.parse(v))
const decks = computed<DiscoverDeck[]>(() => (data.value?.decks ?? []).map(d => ({
  id: d.shareId,
  name: d.name,
  game: d.game,
  raw: d.raw,
  owner: d.ownerDisplayName,
  createdAt: time(d.createdAt),
  updatedAt: time(d.updatedAt),
})))
const { fingerprints } = useDeckFingerprints(decks)
const { filters, results, active, reset } = useDiscoverFilters(decks, fingerprints)

const loading = computed(() => status.value === 'pending')
const errored = computed(() => !!error.value)
</script>

<template>
  <div class="discover-page fade-up">
    <header class="discover-head">
      <h1 class="discover-title">
        {{ t('discover.title') }}
      </h1>
      <p class="discover-subtitle">
        {{ t('discover.subtitle') }}
      </p>
    </header>

    <DiscoverFilterBar v-model="filters" :count="results.length" :active="active" @reset="reset" />

    <div v-if="loading" class="discover-state">
      <UIcon name="i-lucide-loader-circle" class="h-8 w-8 animate-spin text-(--accent-text)" />
    </div>

    <div v-else-if="errored" class="discover-state">
      <p class="text-(--color-text-muted)">
        {{ t('discover.error') }}
      </p>
      <UButton color="neutral" variant="subtle" icon="i-lucide-refresh-cw" @click="refresh()">
        {{ t('discover.retry') }}
      </UButton>
    </div>

    <div v-else-if="!decks.length" class="discover-state">
      <p class="text-(--color-text-muted)">
        {{ t('discover.empty') }}
      </p>
    </div>

    <div v-else-if="!results.length" class="discover-state">
      <p class="text-(--color-text-muted)">
        {{ t('discover.noMatch') }}
      </p>
      <UButton color="neutral" variant="subtle" icon="i-lucide-rotate-ccw" @click="reset">
        {{ t('discover.reset') }}
      </UButton>
    </div>

    <div v-else class="discover-grid">
      <DeckTile
        v-for="d in results"
        :key="d.id"
        :deck="d"
        :fingerprint="fingerprints.get(d.id)!"
        :to="sharedPath(d.game, d.id)"
        :owner="d.owner"
      />
    </div>
  </div>
</template>

<style scoped>
.discover-page {
  max-width: 1720px;
  margin: 0 auto;
  padding: 32px 20px 60px;
}
.discover-head {
  margin-bottom: 18px;
}
.discover-title {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text-high);
}
.discover-subtitle {
  margin-top: 6px;
  color: var(--color-text-muted);
  font-size: 14px;
}
.discover-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 0;
  text-align: center;
}
.discover-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
  margin-top: 22px;
}
</style>
