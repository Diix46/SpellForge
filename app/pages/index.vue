<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDecklist } from '~/composables/useDecklist'
import { useDeckStore } from '~/composables/useDeckStore'
import { useManaIdentity } from '~/composables/useManaIdentity'

const { locale, t, formatShortDate } = useLocale()

useSeoMeta({
  title: () => t('dash.title'),
  description: 'Gérez vos decklists Magic: The Gathering, imprimez vos proxies en FR/EN.',
})

const route = useRoute()
const router = useRouter()
const { decks, createDeck, deleteDeck, duplicateDeck, updateDeck } = useDeckStore()
const { parse, totalCards } = useDecklist()
const { identity, colorVar } = useManaIdentity()
const toast = useToast()

// Modals
const showNewDeck = ref(false)
const newDeckName = ref('')
const showImport = ref(false)
const importUrl = ref('')
const importing = ref(false)

// Rename
const showRename = ref(false)
const renameId = ref('')
const renameValue = ref('')

// Delete confirmation
const showDelete = ref(false)
const deleteId = ref('')
const deleteName = ref('')

// Open the right modal when arriving via a sidebar/topbar query (?new / ?import).
// Uses a watcher (not onMounted) so it also fires when the query changes while
// the dashboard is already mounted — Vue Router reuses the component otherwise.
watch(() => route.query, (q) => {
  if (!q.new && !q.import)
    return
  // Exactly one modal at a time (a stray ?new&import or switching while one is
  // open shouldn't stack them).
  showNewDeck.value = !!q.new
  showImport.value = !q.new && !!q.import
  // Strip ONLY our action params, preserving any other query state.
  const { new: _new, import: _import, ...rest } = q
  router.replace({ query: rest })
}, { immediate: true })

const totalCardsAll = computed(() =>
  decks.value.reduce((sum, d) => {
    const { mainboard, sideboard } = parse(d.raw)
    return sum + totalCards(mainboard) + totalCards(sideboard)
  }, 0),
)

function deckCardCount(raw: string): number {
  const { mainboard, sideboard } = parse(raw)
  return totalCards(mainboard) + totalCards(sideboard)
}

const lastUpdated = computed(() => {
  if (!decks.value.length)
    return '—'
  return formatShortDate(Math.max(...decks.value.map(d => d.updatedAt)))
})

// Decks "ready to play" ≈ those at/over a typical Commander/Standard size.
const readyCount = computed(() =>
  decks.value.filter(d => deckCardCount(d.raw) >= 60).length,
)

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

async function handleCreate() {
  const deck = createDeck(newDeckName.value || t('nav.newDeck'))
  showNewDeck.value = false
  newDeckName.value = ''
  await navigateTo(`/deck/${deck.id}`)
}

async function handleImport() {
  if (!importUrl.value.trim())
    return
  importing.value = true
  try {
    const result = await $fetch<{ name: string, raw: string, source: string, cardCount: number }>('/api/import', {
      method: 'POST',
      body: { url: importUrl.value.trim() },
    })
    const deck = createDeck(result.name, result.raw, result.source)
    toast.add({
      title: locale.value === 'fr' ? 'Deck importé' : 'Deck imported',
      description: `${result.name} — ${result.cardCount} ${t('dash.cards')}`,
      color: 'success',
      icon: 'i-lucide-check',
    })
    showImport.value = false
    importUrl.value = ''
    await navigateTo(`/deck/${deck.id}`)
  }
  catch (err: unknown) {
    toast.add({
      title: locale.value === 'fr' ? 'Import échoué' : 'Import failed',
      description: errMessage(err) || (locale.value === 'fr' ? 'Erreur inconnue' : 'Unknown error'),
      color: 'error',
      icon: 'i-lucide-x',
    })
  }
  finally {
    importing.value = false
  }
}

function requestDelete(id: string, name: string) {
  deleteId.value = id
  deleteName.value = name
  showDelete.value = true
}

function confirmDelete() {
  if (deleteId.value) {
    deleteDeck(deleteId.value)
    toast.add({ title: locale.value === 'fr' ? 'Deck supprimé' : 'Deck deleted', color: 'neutral', icon: 'i-lucide-trash-2' })
  }
  showDelete.value = false
}

function openRename(id: string) {
  const deck = decks.value.find(d => d.id === id)
  if (!deck)
    return
  renameId.value = id
  renameValue.value = deck.name
  showRename.value = true
}

function handleRename() {
  if (renameValue.value.trim()) {
    updateDeck(renameId.value, { name: renameValue.value.trim() })
  }
  showRename.value = false
}

const modalUi = {
  overlay: 'bg-ink-950/70 backdrop-blur-[6px]',
  content: 'glass rounded-[var(--radius-2xl)]',
}
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
          @click="showImport = true"
        >
          {{ t('nav.import') }}
        </UButton>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          variant="solid"
          class="cta-glow"
          @click="showNewDeck = true"
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
        <UButton icon="i-lucide-plus" color="primary" variant="solid" size="lg" @click="showNewDeck = true">
          {{ t('dash.empty.create') }}
        </UButton>
        <UButton icon="i-lucide-download" color="neutral" variant="subtle" size="lg" @click="showImport = true">
          {{ t('dash.empty.import') }}
        </UButton>
      </div>
    </div>

    <template v-else>
      <!-- STAT STRIP -->
      <div class="stats">
        <div class="stat">
          <div class="stat-lab">
            <UIcon name="i-lucide-layout-grid" class="h-3.5 w-3.5" />{{ t('dash.decks') }}
          </div>
          <div class="stat-val">
            {{ decks.length }}
          </div>
        </div>
        <div class="stat">
          <div class="stat-lab">
            <UIcon name="i-lucide-layers" class="h-3.5 w-3.5" />{{ t('dash.cards') }}
          </div>
          <div class="stat-val">
            {{ totalCardsAll }}
          </div>
        </div>
        <div class="stat">
          <div class="stat-lab">
            <UIcon name="i-lucide-zap" class="h-3.5 w-3.5" />{{ t('dash.ready') }}
          </div>
          <div class="stat-val">
            {{ readyCount }}
          </div>
        </div>
        <div class="stat">
          <div class="stat-lab">
            <UIcon name="i-lucide-clock" class="h-3.5 w-3.5" />{{ t('dash.lastUpdate') }}
          </div>
          <div class="stat-val stat-val--sm">
            {{ lastUpdated }}
          </div>
        </div>
      </div>

      <!-- BENTO: featured deck + quick-start -->
      <div v-if="featured" class="bento">
        <button
          type="button"
          class="feature"
          :style="featuredAccent"
          @click="navigateTo(`/deck/${featured.id}`)"
        >
          <span class="feature-tag">
            <span class="dot" />{{ t('dash.recent') }}
          </span>
          <div>
            <h3 class="feature-name">
              {{ featured.name }}
            </h3>
            <div class="feature-meta">
              <span><b>{{ featuredCount }}</b> {{ t('dash.cards') }}</span>
              <span v-if="featuredColors.length"><b>{{ featuredColors.join('').toUpperCase() }}</b></span>
            </div>
            <div class="feature-pips">
              <span
                v-for="c in featuredColors"
                :key="c"
                class="pip"
                :style="{ background: colorVar(c) }"
              />
            </div>
          </div>
          <span class="feature-cta">
            {{ t('dash.continue') }}<UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
          </span>
        </button>

        <div class="bento-side">
          <button type="button" class="mini" @click="showNewDeck = true">
            <div class="mini-ic">
              <UIcon name="i-lucide-plus" class="h-[18px] w-[18px]" />
            </div>
            <div>
              <div class="mini-t">
                {{ t('dash.empty.create') }}
              </div>
              <div class="mini-d">
                {{ t('dash.quickNew') }}
              </div>
            </div>
          </button>
          <button type="button" class="mini" @click="showImport = true">
            <div class="mini-ic">
              <UIcon name="i-lucide-download" class="h-[18px] w-[18px]" />
            </div>
            <div>
              <div class="mini-t">
                {{ t('dash.empty.import') }}
              </div>
              <div class="mini-d">
                {{ t('dash.quickImport') }}
              </div>
            </div>
          </button>
        </div>
      </div>

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
          @delete="requestDelete"
          @rename="openRename"
        />
        <!-- new deck tile -->
        <button class="new-tile stagger-item" :style="{ '--stagger-delay': `${restDecks.length * 45}ms` }" @click="showNewDeck = true">
          <span class="new-plus"><UIcon name="i-lucide-plus" class="h-5 w-5" /></span>
          <span>{{ t('nav.newDeck') }}</span>
        </button>
      </div>
    </template>

    <!-- NEW DECK MODAL -->
    <UModal
      v-model:open="showNewDeck"
      :title="t('modal.newDeck')"
      :ui="modalUi"
    >
      <template #body>
        <UFormField :label="t('modal.deckName')">
          <UInput
            v-model="newDeckName"
            name="new-deck-name"
            placeholder="ex. Atraxa Superfriends"
            autofocus
            class="w-full font-mono"
            @keyup.enter="handleCreate"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="subtle"
            @click="showNewDeck = false"
          >
            {{ t('modal.cancel') }}
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-sparkles"
            @click="handleCreate"
          >
            {{ t('modal.create') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- DELETE CONFIRM MODAL -->
    <UModal
      v-model:open="showDelete"
      :title="t('modal.deleteTitle')"
      :ui="modalUi"
    >
      <template #body>
        <p class="text-(--color-text-mid)">
          {{ t('modal.deleteBody') }}
          <span class="font-semibold text-(--color-text-high)">{{ deleteName }}</span> ?
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="subtle"
            @click="showDelete = false"
          >
            {{ t('modal.cancel') }}
          </UButton>
          <UButton
            color="error"
            icon="i-lucide-trash-2"
            @click="confirmDelete"
          >
            {{ t('tile.delete') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- RENAME MODAL -->
    <UModal
      v-model:open="showRename"
      :title="t('modal.rename')"
      :ui="modalUi"
    >
      <template #body>
        <UFormField :label="t('modal.deckName')">
          <UInput
            v-model="renameValue"
            name="rename-deck"
            autofocus
            class="w-full font-mono"
            @keyup.enter="handleRename"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="subtle"
            @click="showRename = false"
          >
            {{ t('modal.cancel') }}
          </UButton>
          <UButton
            color="primary"
            @click="handleRename"
          >
            {{ t('modal.save') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- IMPORT MODAL -->
    <UModal
      v-model:open="showImport"
      :title="t('modal.importDeck')"
      :ui="modalUi"
    >
      <template #body>
        <div class="space-y-3">
          <UFormField
            :label="t('modal.edhrecUrl')"
            :help="t('modal.edhrecHelp')"
          >
            <UInput
              v-model="importUrl"
              name="import-url"
              placeholder="https://edhrec.com/commanders/atraxa-praetors-voice"
              autofocus
              class="w-full font-mono text-sm"
              @keyup.enter="handleImport"
            />
          </UFormField>
          <UAlert
            color="info"
            variant="soft"
            icon="i-lucide-info"
            :title="t('modal.examples')"
            description="edhrec.com/commanders/<nom> • edhrec.com/average-decks/<nom> • edhrec.com/deckpreview/<id>"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="subtle"
            @click="showImport = false"
          >
            {{ t('modal.cancel') }}
          </UButton>
          <UButton
            color="primary"
            :loading="importing"
            icon="i-lucide-download"
            @click="handleImport"
          >
            {{ t('modal.import') }}
          </UButton>
        </div>
      </template>
    </UModal>
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

/* ---------- Stat strip ---------- */
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 24px;
}
.stat {
  border: 1px solid var(--color-border-hairline);
  background: var(--color-surface-1);
  border-radius: var(--radius-md);
  padding: 15px 17px;
  transition: border-color var(--dur) var(--ease-out);
}
.stat:hover {
  border-color: var(--color-border-subtle);
}
.stat-lab {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-disabled);
  font-weight: 500;
  margin-bottom: 9px;
}
.stat-val {
  font-family: var(--font-mono);
  font-size: 25px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--color-text-high);
}
.stat-val--sm {
  font-size: 18px;
}

/* ---------- Bento ---------- */
.bento {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
  margin-bottom: 28px;
}
.feature {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 210px;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  padding: 22px;
  background: radial-gradient(420px 220px at 90% 0%, var(--accent-soft), transparent 62%), var(--color-surface-1);
  transition:
    border-color var(--dur) var(--ease-out),
    transform var(--dur-slow) var(--ease-spring);
}
.feature:hover {
  border-color: var(--accent-border);
  transform: translateY(-3px);
}
.feature::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px);
  background-size: 38px 38px;
  -webkit-mask-image: radial-gradient(120% 90% at 50% 0%, #000, transparent 72%);
  mask-image: radial-gradient(120% 90% at 50% 0%, #000, transparent 72%);
  pointer-events: none;
}
.feature > * {
  position: relative;
}
.feature-tag {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent-text);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  padding: 4px 10px;
  border-radius: var(--radius-full);
}
.feature-tag .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}
.feature-name {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--color-text-high);
  margin: 14px 0 6px;
}
.feature-meta {
  display: flex;
  gap: 14px;
  color: var(--color-text-muted);
  font-size: 13px;
}
.feature-meta b {
  color: var(--color-text-mid);
  font-weight: 500;
  font-family: var(--font-mono);
}
.feature-pips {
  display: flex;
  gap: 5px;
  margin-top: 14px;
}
.feature-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--accent-text);
}
.pip {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.14);
}

.bento-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.mini {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 13px;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--color-border-hairline);
  background: var(--color-surface-1);
  border-radius: var(--radius-md);
  padding: 16px 18px;
  transition:
    border-color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out);
}
.mini:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-2);
}
.mini-ic {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: var(--color-surface-3);
  color: var(--color-text-mid);
}
.mini:hover .mini-ic {
  color: var(--accent-text);
}
.mini-t {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-high);
}
.mini-d {
  font-size: 12px;
  color: var(--color-text-disabled);
  margin-top: 2px;
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

@media (max-width: 920px) {
  .bento {
    grid-template-columns: 1fr;
  }
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
