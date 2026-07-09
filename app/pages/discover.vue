<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

interface DiscoverDeck {
  name: string
  ownerDisplayName: string
  updatedAt: number
  shareId: string
}

const { t, formatShortDate } = useLocale()

const decks = ref<DiscoverDeck[]>([])
const loading = ref(true)
const errored = ref(false)
const query = ref('')

useSeoMeta({
  title: () => t('discover.title'),
  description: () => t('discover.subtitle'),
})

async function load() {
  loading.value = true
  errored.value = false
  try {
    decks.value = (await $fetch<{ decks: DiscoverDeck[] }>('/api/decks/discover', {
      query: query.value ? { q: query.value } : {},
    })).decks
  }
  catch {
    errored.value = true
  }
  finally {
    loading.value = false
  }
}

let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(query, () => {
  if (searchDebounce)
    clearTimeout(searchDebounce)
  searchDebounce = setTimeout(load, 300)
})

onMounted(load)
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
      <UInput
        v-model="query"
        icon="i-lucide-search"
        :placeholder="t('discover.searchPlaceholder')"
        class="discover-search"
      />
    </header>

    <div v-if="loading" class="discover-state">
      <UIcon name="i-lucide-loader-circle" class="h-8 w-8 animate-spin text-(--accent-text)" />
    </div>

    <div v-else-if="errored" class="discover-state">
      <p class="text-(--color-text-muted)">
        {{ t('discover.error') }}
      </p>
      <UButton color="neutral" variant="subtle" icon="i-lucide-refresh-cw" @click="load">
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
        :to="`/shared/${d.shareId}`"
        class="discover-card"
      >
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
.discover-search {
  margin-top: 16px;
  max-width: 360px;
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
