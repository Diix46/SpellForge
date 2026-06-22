<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardModals } from '~/composables/useDashboardModals'
import { useDecklist } from '~/composables/useDecklist'
import { useDeckStore } from '~/composables/useDeckStore'
import { useManaIdentity } from '~/composables/useManaIdentity'

const { t, formatShortDate } = useLocale()

useSeoMeta({
  title: () => t('dash.title'),
  description: 'Gérez vos decklists Magic: The Gathering, imprimez vos proxies en FR/EN.',
})

const route = useRoute()
const router = useRouter()
const { decks, duplicateDeck } = useDeckStore()
const { parse, totalCards } = useDecklist()
const { identity } = useManaIdentity()

// Modal state + create/import/rename/delete handlers + ?new/?import deep-link.
const modals = useDashboardModals(route, router)

function deckCardCount(raw: string): number {
  const { mainboard, sideboard } = parse(raw)
  return totalCards(mainboard) + totalCards(sideboard)
}

const totalCardsAll = computed(() => decks.value.reduce((sum, d) => sum + deckCardCount(d.raw), 0))

const lastUpdated = computed(() => {
  if (!decks.value.length)
    return '—'
  return formatShortDate(Math.max(...decks.value.map(d => d.updatedAt)))
})

// Decks "ready to play" ≈ those at/over a typical Commander/Standard size.
const readyCount = computed(() => decks.value.filter(d => deckCardCount(d.raw) >= 60).length)

// Featured = most-recently-updated deck (drives the bento hero).
const featured = computed(() => {
  if (!decks.value.length)
    return null
  return [...decks.value].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
})
const featuredCount = computed(() => featured.value ? deckCardCount(featured.value.raw) : 0)
// The featured bento glows in the featured deck's mana identity (or neutral).
const { themeColors: featuredColors, themeStyle: featuredAccent } = useDeckTheme(() =>
  featured.value ? identity(featured.value.raw) : [],
)

// Other decks (grid below the bento) — everything except the featured one.
const restDecks = computed(() =>
  [...decks.value].sort((a, b) => b.updatedAt - a.updatedAt).filter(d => d.id !== featured.value?.id),
)
</script>

<template>
  <div class="fade-up dash">
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
        v-if="featured"
        :featured="featured"
        :count="featuredCount"
        :colors="featuredColors"
        :accent="featuredAccent"
        @open="(id) => navigateTo(`/deck/${id}`)"
        @new="modals.showNewDeck.value = true"
        @import="modals.showImport.value = true"
      />

      <!-- DECK GRID -->
      <div class="sec">
        <h2 class="sec-title">
          {{ t('dash.allDecks') }}
        </h2>
      </div>
      <div class="grid">
        <DeckTile
          v-for="(deck, i) in restDecks"
          :key="deck.id"
          :deck="deck"
          class="stagger-item"
          :style="{ '--stagger-delay': `${i * 45}ms` }"
          @open="(id) => navigateTo(`/deck/${id}`)"
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
