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
  ownerProfile: string | null
  likes: number
  liked: boolean
  mine: boolean
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
  ownerProfile: d.ownerProfile,
  likes: d.likes,
  liked: d.liked,
  mine: d.mine,
  createdAt: time(d.createdAt),
  updatedAt: time(d.updatedAt),
})))
const { fingerprints } = useDeckFingerprints(decks)
const { filters, results, active, reset } = useDiscoverFilters(decks, fingerprints)

// The deck of each game liked the most, on top while nothing is filtered.
const featured = computed(() => (active.value
  ? []
  : [...new Map([...decks.value].filter(d => (d.likes ?? 0) > 0).sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).map(d => [d.game, d] as const).reverse()).values()]))

// Liking: shown at once, the server's count after.
const { loggedIn } = useAuth()
const members = useMembersOnly()
const toast = useToast()
async function like(d: DiscoverDeck) {
  if (!loggedIn.value)
    return members.require('decks')
  const row = data.value?.decks.find(x => x.shareId === d.id)
  if (!row)
    return
  const liked = !row.liked
  row.liked = liked
  row.likes += liked ? 1 : -1
  try {
    const res = await $fetch<{ liked: boolean, likes: number }>('/api/decks/like', { method: 'POST', body: { shareId: d.id, liked } })
    row.likes = res.likes
  }
  catch (e) {
    row.liked = !liked
    row.likes += liked ? -1 : 1
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? t('discover.likeFailed'), color: 'error' })
  }
}

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
      <UButton color="primary" icon="i-lucide-share-2" to="/decks">
        {{ t('discover.publish') }}
      </UButton>
    </div>

    <div v-else-if="!results.length" class="discover-state">
      <p class="text-(--color-text-muted)">
        {{ t('discover.noMatch') }}
      </p>
      <UButton color="neutral" variant="subtle" icon="i-lucide-rotate-ccw" @click="reset">
        {{ t('discover.reset') }}
      </UButton>
    </div>

    <template v-else>
      <!-- The most liked deck of each game, while nothing is filtered. -->
      <section v-if="featured.length" class="discover-featured">
        <h2>{{ t('discover.featured') }}</h2>
        <div class="discover-grid">
          <div v-for="d in featured" :key="d.id" class="discover-item">
            <DeckTile
              :deck="d"
              :fingerprint="fingerprints.get(d.id)!"
              :to="sharedPath(d.game, d.id)"
              :owner="d.owner"
            />
            <div class="discover-meta">
              <NuxtLink v-if="d.ownerProfile" :to="`/joueur/${d.ownerProfile}`" class="discover-owner">
                <UIcon name="i-lucide-user" class="h-3.5 w-3.5" /> {{ d.owner }}
              </NuxtLink>
              <span v-else />
              <button
                type="button"
                class="discover-like"
                :aria-pressed="!!d.liked"
                :disabled="d.mine"
                :title="d.mine ? t('discover.likeMine') : d.liked ? t('discover.unlike') : t('discover.like')"
                :aria-label="d.liked ? t('discover.unlike') : t('discover.like')"
                @click="like(d)"
              >
                <UIcon name="i-lucide-heart" class="h-4 w-4" />
                {{ d.likes ?? 0 }}
              </button>
            </div>
          </div>
        </div>
      </section>
      <div class="discover-grid">
        <div v-for="d in results" :key="d.id" class="discover-item">
          <DeckTile
            :deck="d"
            :fingerprint="fingerprints.get(d.id)!"
            :to="sharedPath(d.game, d.id)"
            :owner="d.owner"
          />
          <div class="discover-meta">
            <NuxtLink v-if="d.ownerProfile" :to="`/joueur/${d.ownerProfile}`" class="discover-owner">
              <UIcon name="i-lucide-user" class="h-3.5 w-3.5" /> {{ d.owner }}
            </NuxtLink>
            <span v-else />
            <button
              type="button"
              class="discover-like"
              :aria-pressed="!!d.liked"
              :disabled="d.mine"
              :title="d.mine ? t('discover.likeMine') : d.liked ? t('discover.unlike') : t('discover.like')"
              :aria-label="d.liked ? t('discover.unlike') : t('discover.like')"
              @click="like(d)"
            >
              <UIcon name="i-lucide-heart" class="h-4 w-4" />
              {{ d.likes ?? 0 }}
            </button>
          </div>
        </div>
      </div>
      <!-- Few decks yet: the way to add one's own. -->
      <aside v-if="decks.length < 12" class="discover-invite">
        <UIcon name="i-lucide-share-2" class="h-5 w-5 shrink-0" />
        <p>{{ t('discover.invite') }}</p>
        <UButton color="neutral" variant="subtle" to="/decks" trailing-icon="i-lucide-arrow-right">
          {{ t('discover.publish') }}
        </UButton>
      </aside>
    </template>
  </div>
</template>

<style scoped>
.discover-page {
  /* The app frame's gutter, as every page: no second one of its own. */
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-width: 0;
}
.discover-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--title-page);
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--color-text-high);
}
.discover-subtitle {
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
}
.discover-featured {
  display: grid;
  gap: 12px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--color-border-hairline);
}
.discover-featured h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-high);
}
.discover-item {
  display: grid;
  gap: 6px;
}
.discover-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px;
  font-size: 12.5px;
}
.discover-owner {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-mid);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.discover-like {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 999px;
  color: var(--color-text-mid);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.discover-like:hover:not(:disabled) {
  border-color: #e0443a;
  color: #e0443a;
}
.discover-like[aria-pressed='true'] {
  border-color: #e0443a;
  background: color-mix(in srgb, #e0443a 14%, transparent);
  color: #e0443a;
}
.discover-like:disabled {
  cursor: default;
  opacity: 0.6;
}
.discover-invite {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  padding: 18px 20px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  color: var(--color-text-mid);
}
.discover-invite p {
  flex: 1 1 280px;
  margin: 0;
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
}
</style>
