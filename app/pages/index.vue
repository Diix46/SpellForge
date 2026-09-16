<script setup lang="ts">
import type { GameId } from '#shared/game'
import { computed, ref } from 'vue'
import { deckPath } from '#shared/game'
import { useAuth } from '~/composables/useAuth'
import { useDashboardModals } from '~/composables/useDashboardModals'
import { useDeckFingerprints } from '~/composables/useDeckFingerprints'
import { useDeckStore } from '~/composables/useDeckStore'

const { t, formatShortDate } = useLocale()
const { loggedIn } = useAuth()

const route = useRoute()
const router = useRouter()
const { decks, duplicateDeck, getDeck } = useDeckStore()

function openDeck(id: string) {
  const deck = getDeck(id)
  if (deck)
    navigateTo(deckPath(deck))
}

// "/" is the landing for first-time visitors, the dashboard for everyone else.
// No account is required to manage decks (they live in localStorage as a
// guest); the marketing landing only shows before someone has actually
// started — once a guest has a deck, "/" behaves like a member's dashboard.
const showLanding = computed(() => !loggedIn.value && decks.value.length === 0)

useSeoMeta({
  title: () => (showLanding.value ? 'Spellforge — Deck manager & proxy printer' : t('dash.title')),
  description: () => (showLanding.value ? t('landing.subtitle') : 'Gérez vos decklists Magic: The Gathering, imprimez vos proxies en FR/EN.'),
})
// Per-deck count, colours and Leader, for tiles of either world.
const { fingerprints } = useDeckFingerprints(decks)

// Modal state + create/import/rename/delete handlers + ?new/?import deep-link.
const modals = useDashboardModals(route, router)

const totalCardsAll = computed(() => decks.value.reduce((sum, d) => sum + (fingerprints.value.get(d.id)?.count ?? 0), 0))

const lastUpdated = computed(() => {
  if (!decks.value.length)
    return '—'
  return formatShortDate(Math.max(...decks.value.map(d => d.updatedAt)))
})

// Decks at their game's full size: 100 for Commander, Leader + 50 for One Piece.
const readyCount = computed(() => decks.value.filter(d => fingerprints.value.get(d.id)?.complete).length)

// Featured = most-recently-updated deck (drives the bento hero).
const featured = computed(() => {
  if (!decks.value.length)
    return null
  return [...decks.value].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
})
const featuredPrint = computed(() => (featured.value ? fingerprints.value.get(featured.value.id) ?? null : null))

// Both worlds share the grid; a filter narrows it to one.
const worldFilter = ref<GameId | 'all'>('all')
const worldCounts = computed(() => ({
  optcg: decks.value.filter(d => d.game === 'optcg').length,
  mtg: decks.value.filter(d => d.game === 'mtg').length,
}))

// Other decks (grid below the bento) — everything except the featured one.
const restDecks = computed(() =>
  [...decks.value]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter(d => d.id !== featured.value?.id)
    .filter(d => worldFilter.value === 'all' || d.game === worldFilter.value),
)
</script>

<template>
  <!-- Single root (Nuxt page transitions require it) wrapping both branches:
       first-time visitors get the marketing landing; everyone else (guest
       with local decks, or a signed-in member) gets the dashboard. Same URL
       ("/") — no redirect, no /landing. -->
  <div>
    <LandingPage v-if="showLanding" />

    <div v-else class="fade-up dash">
      <!-- PAGE HEAD -->
      <header class="dash-head">
        <div class="min-w-0">
          <h1 class="dash-title">
            {{ t('dash.title') }}
          </h1>
          <p class="dash-sub">
            <template v-if="decks.length">
              {{ decks.length }} {{ t('dash.decks') }} · {{ totalCardsAll }} {{ t('dash.cards') }} · {{ t('dash.lastUpdate') }} {{ lastUpdated }}
            </template>
            <template v-else>
              {{ t('dash.subtitle') }}
            </template>
          </p>
        </div>
        <div class="dash-actions">
          <UButton
            icon="i-lucide-download"
            color="neutral"
            variant="subtle"
            @click="modals.showImport.value = true"
          >
            {{ t('nav.import') }}
          </UButton>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            variant="solid"
            class="cta-glow"
            @click="modals.showNewDeck.value = true"
          >
            {{ t('nav.newDeck') }}
          </UButton>
        </div>
      </header>

      <!-- EMPTY STATE -->
      <div v-if="decks.length === 0" class="empty">
        <div class="empty-art bob">
          <UIcon name="i-lucide-layers" class="h-9 w-9" />
        </div>
        <h2 class="empty-title">
          {{ t('dash.empty.title') }}
        </h2>
        <p class="empty-body">
          {{ t('dash.empty.body') }}
        </p>
        <div class="empty-cta">
          <UButton icon="i-lucide-plus" color="primary" variant="solid" size="lg" @click="modals.showNewDeck.value = true">
            {{ t('dash.empty.create') }}
          </UButton>
          <UButton icon="i-lucide-download" color="neutral" variant="subtle" size="lg" @click="modals.showImport.value = true">
            {{ t('dash.empty.import') }}
          </UButton>
        </div>
      </div>

      <template v-else>
        <DashboardDashStats
          :deck-count="decks.length"
          :total-cards="totalCardsAll"
          :ready-count="readyCount"
          :last-updated="lastUpdated"
        />

        <DashboardDeckBento
          v-if="featured && featuredPrint"
          :featured="featured"
          :fingerprint="featuredPrint"
          @open="openDeck"
          @new="modals.showNewDeck.value = true"
          @import="modals.showImport.value = true"
        />

        <!-- DECK GRID -->
        <div class="sec">
          <h2 class="sec-title">
            {{ t('dash.allDecks') }}
          </h2>
          <div v-if="worldCounts.optcg && worldCounts.mtg" class="world-filter" role="group">
            <button type="button" :aria-pressed="worldFilter === 'all'" @click="worldFilter = 'all'">
              {{ t('dash.filterAll') }}
            </button>
            <button type="button" :aria-pressed="worldFilter === 'optcg'" @click="worldFilter = 'optcg'">
              One Piece · {{ worldCounts.optcg }}
            </button>
            <button type="button" :aria-pressed="worldFilter === 'mtg'" @click="worldFilter = 'mtg'">
              Magic · {{ worldCounts.mtg }}
            </button>
          </div>
        </div>
        <div class="grid">
          <DeckTile
            v-for="(deck, i) in restDecks"
            :key="deck.id"
            :deck="deck"
            :fingerprint="fingerprints.get(deck.id)!"
            class="stagger-item"
            :style="{ '--stagger-delay': `${i * 45}ms` }"
            @open="openDeck"
            @duplicate="(id) => duplicateDeck(id)"
            @delete="modals.requestDelete"
            @rename="modals.openRename"
          />
          <!-- new deck tile -->
          <button class="new-tile stagger-item" :style="{ '--stagger-delay': `${restDecks.length * 45}ms` }" @click="modals.showNewDeck.value = true">
            <span class="new-plus"><UIcon name="i-lucide-plus" class="h-5 w-5" /></span>
            <span>{{ t('nav.newDeck') }}</span>
          </button>
        </div>
      </template>

      <DashboardDeckModals
        v-model:show-new-deck="modals.showNewDeck.value"
        v-model:new-deck-name="modals.newDeckName.value"
        v-model:new-deck-game="modals.newDeckGame.value"
        v-model:show-import="modals.showImport.value"
        v-model:import-url="modals.importUrl.value"
        v-model:show-rename="modals.showRename.value"
        v-model:rename-value="modals.renameValue.value"
        v-model:show-delete="modals.showDelete.value"
        :importing="modals.importing.value"
        :delete-name="modals.deleteName.value"
        @create="modals.handleCreate"
        @import="modals.handleImport"
        @rename="modals.handleRename"
        @confirm-delete="modals.confirmDelete"
      />
    </div>
  </div>
</template>

<style scoped>
/* ---------- Page head ---------- */
.dash-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 26px;
}
.dash-title {
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--color-text-high);
  margin: 0 0 6px;
}
.dash-sub {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
}
.dash-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.cta-glow {
  box-shadow: var(--accent-glow);
}

/* ---------- Empty state ---------- */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-2xl);
  background: var(--color-surface-1);
  padding: 56px 24px;
}
.empty-art {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  background: var(--color-surface-2);
  color: var(--color-text-mid);
  margin-bottom: 18px;
}
.empty-title {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 600;
  color: var(--color-text-high);
  margin: 0;
}
.empty-body {
  max-width: 22rem;
  margin: 8px 0 24px;
  color: var(--color-text-muted);
  font-size: 14px;
}
.empty-cta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

/* ---------- Section + grid ---------- */
.sec {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 0 14px;
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
.sec-title {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-high);
  margin: 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(244px, 1fr));
  gap: 16px;
}
.new-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 188px;
  cursor: pointer;
  border: 1px dashed var(--color-border-subtle);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  font-size: 13.5px;
  font-weight: 500;
  transition:
    border-color var(--dur) var(--ease-out),
    color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out),
    transform var(--dur-slow) var(--ease-spring);
}
.new-tile:hover {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-soft);
  transform: translateY(-4px);
}
.new-plus {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  border: 1px solid currentColor;
  transition: transform var(--dur-slow) var(--ease-spring);
}
.new-tile:hover .new-plus {
  transform: rotate(90deg);
}
</style>
