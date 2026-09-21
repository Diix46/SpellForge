<script setup lang="ts">
import type { GameId } from '#shared/game'
import { computed, ref, watch } from 'vue'
import { sharedPath } from '#shared/game'

interface DiscoverDeck {
  name: string
  game: GameId
  ownerDisplayName: string
  updatedAt: number
  shareId: string
}

// The public gallery, rendered by the server: the decks are what a search
// engine should find here.
const { t, formatShortDate } = useLocale()

const query = ref('')
const search = ref('')
const game = ref<GameId | 'all'>('all')
const GAMES = [
  { value: 'all', label: () => t('discover.all') },
  { value: 'optcg', label: () => 'One Piece' },
  { value: 'mtg', label: () => 'Magic' },
] as const

usePublicSeo({
  title: () => t('discover.title'),
  description: () => t('discover.subtitle'),
})

// The text filter waits for a pause in typing.
let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(query, (q) => {
  if (searchDebounce)
    clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => (search.value = q.trim()), 300)
})

const { data, status, error, refresh } = await useFetch<{ decks: DiscoverDeck[] }>('/api/decks/discover', {
  query: computed(() => ({
    ...(search.value ? { q: search.value } : {}),
    ...(game.value !== 'all' ? { game: game.value } : {}),
  })),
})
const decks = computed(() => data.value?.decks ?? [])
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
      <div class="discover-tools">
        <UInput
          v-model="query"
          icon="i-lucide-search"
          :placeholder="t('discover.searchPlaceholder')"
          class="discover-search"
        />
        <div class="world-filter" role="group">
          <button
            v-for="g in GAMES"
            :key="g.value"
            type="button"
            :class="`world--${g.value}`"
            :aria-pressed="game === g.value"
            @click="game = g.value"
          >
            {{ g.label() }}
          </button>
        </div>
      </div>
    </header>

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

    <div v-else-if="decks.length === 0" class="discover-state">
      <p class="text-(--color-text-muted)">
        {{ t('discover.empty') }}
      </p>
    </div>

    <div v-else class="discover-grid">
      <NuxtLink
        v-for="d in decks"
        :key="d.shareId"
        :to="sharedPath(d.game, d.shareId)"
        class="discover-card"
        :class="`discover-card--${d.game}`"
      >
        <span class="discover-card-world">{{ d.game === 'optcg' ? 'One Piece' : 'Magic' }}</span>
        <h3 class="discover-card-name">
          {{ d.name }}
        </h3>
        <p class="discover-card-meta">
          {{ t('discover.by') }} <span class="font-medium text-(--color-text-mid)">{{ d.ownerDisplayName }}</span>
          · {{ t('discover.updatedOn') }} {{ formatShortDate(d.updatedAt) }}
        </p>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.discover-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 20px 60px;
}
.discover-head {
  margin-bottom: 28px;
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
.discover-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
.discover-search {
  width: 100%;
  max-width: 360px;
}
.world-filter {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-sm);
}
.world-filter button {
  padding: 4px 10px;
  border-radius: calc(var(--radius-sm) - 2px);
  font-size: 12.5px;
  color: var(--color-text-muted);
}
.world-filter button[aria-pressed='true'] {
  background: var(--color-surface-2);
  color: var(--color-text-high);
}
.discover-card-world {
  display: inline-block;
  margin-bottom: 8px;
  padding: 1px 7px;
  border-radius: 2px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
/* each world wears its own colours, even on a neutral page */
.discover-card--optcg .discover-card-world {
  background: #c9312a;
  color: #fff8ec;
  font-family: 'Anton', Impact, sans-serif;
  letter-spacing: 0.08em;
}
.discover-card--mtg .discover-card-world {
  border: 1px solid rgba(201, 162, 78, 0.55);
  background: #100d14;
  color: #c9a24e;
  font-family: var(--mtg-face);
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
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}
.discover-card {
  display: block;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
  background: var(--color-surface-1);
  transition:
    border-color var(--dur) var(--ease-out),
    transform var(--dur-slow) var(--ease-spring);
}
.discover-card:hover {
  border-color: var(--accent-border);
  transform: translateY(-2px);
}
.discover-card-name {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-high);
  margin-bottom: 6px;
}
.discover-card-meta {
  font-size: 12.5px;
  color: var(--color-text-muted);
}
</style>
