<script setup lang="ts">
import type { ExportFormat } from '#shared/collection-csv'
import type { GameId } from '#shared/game'
import { computed, onMounted, watch } from 'vue'
import { exportCollection } from '#shared/collection-csv'

// Around every collection page: the title, the tabs (copies, sets), the add
// button and its dialog; guests are asked to sign in instead.
const props = defineProps<{ game: GameId }>()

const { t } = useLocale()
const { loggedIn } = useAuth()
const members = useMembersOnly()
const collection = useCollection(props.game)
const { state: add, openAdd } = useCollectionAdd()
const wishlist = useWishlist(props.game)

onMounted(() => {
  if (loggedIn.value) {
    void collection.load()
    void wishlist.load()
  }
})
watch(loggedIn, (v) => {
  if (v) {
    void collection.load(true)
    void wishlist.load(true)
  }
})

const { state: importState, openImport } = useCollectionImportDialog()

/** The whole collection of this game as a file, saved by the browser. */
function download(format: ExportFormat) {
  const text = exportCollection(collection.copies.value, format)
  const ext = format === 'text' ? 'txt' : 'csv'
  // A BOM, so a spreadsheet opens the accents right.
  const blob = new Blob([format === 'text' ? text : `\uFEFF${text}`], { type: format === 'text' ? 'text/plain' : 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `prism-${props.game === 'mtg' ? 'magic' : 'one-piece'}-${format}-${new Date().toISOString().slice(0, 10)}.${ext}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
const exportItems = computed(() => [
  (props.game === 'mtg' ? ['prism', 'manabox', 'moxfield', 'text'] as const : ['prism', 'text'] as const).map(f => ({
    label: t(`collection.export.${f}`),
    icon: f === 'text' ? 'i-lucide-file-text' : 'i-lucide-file-spreadsheet',
    onSelect: () => download(f),
  })),
])

const tabs = [
  { to: collectionPath(props.game), label: 'collection.tabCopies', icon: 'i-lucide-layers', exact: true },
  { to: collectionPath(props.game, '/sets'), label: 'collection.tabSets', icon: 'i-lucide-library-big', exact: false },
  // Only Magic has prices to follow.
  ...(props.game === 'mtg' ? [{ to: collectionPath(props.game, '/value'), label: 'collection.tabValue', icon: 'i-lucide-chart-line', exact: false }] : []),
  { to: collectionPath(props.game, '/wishlist'), label: 'collection.tabWishlist', icon: 'i-lucide-heart', exact: false },
]
</script>

<template>
  <div class="collection fade-up">
    <header class="head">
      <div class="min-w-0">
        <h1 class="title">
          {{ t('collection.title') }}
        </h1>
        <p class="sub">
          {{ t(`collection.subtitle.${game}`) }}
        </p>
      </div>
      <div v-if="loggedIn" class="actions">
        <UButton color="neutral" variant="subtle" icon="i-lucide-upload" @click="openImport()">
          {{ t('collection.import.button') }}
        </UButton>
        <UDropdownMenu :items="exportItems" :content="{ align: 'end' }">
          <UButton color="neutral" variant="subtle" icon="i-lucide-download" trailing-icon="i-lucide-chevron-down" :disabled="!collection.copies.value.length">
            {{ t('collection.export.button') }}
          </UButton>
        </UDropdownMenu>
        <UButton icon="i-lucide-plus" size="lg" @click="openAdd()">
          {{ t('collection.add') }}
        </UButton>
      </div>
    </header>

    <section v-if="!loggedIn" class="panel center">
      <UIcon name="i-lucide-gem" class="h-9 w-9 text-(--accent-text)" />
      <p>{{ t('members.collection') }}</p>
      <UButton icon="i-lucide-log-in" @click="members.require('collection')">
        {{ t('members.login') }}
      </UButton>
    </section>

    <template v-else>
      <nav class="tabs" :aria-label="t('collection.title')">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="tab"
          :active-class="tab.exact ? '' : 'is-active'"
          :exact-active-class="tab.exact ? 'is-active' : ''"
        >
          <UIcon :name="tab.icon" class="h-4 w-4" />
          {{ t(tab.label) }}
          <!-- Wishes whose price came down to their target. -->
          <span v-if="tab.label === 'collection.tabWishlist' && wishlist.reached.value.length" class="badge" :title="t('collection.wish.reachedCount').replace('{n}', String(wishlist.reached.value.length))">{{ wishlist.reached.value.length }}</span>
        </NuxtLink>
      </nav>
      <slot />
      <CollectionImportDialog v-model:open="importState.open" v-model:source="importState.source" :game="game" />
      <CollectionAddDialog v-model:open="add.open" :game="game" :initial-query="add.query" :initial-printing="add.printing" />
    </template>
  </div>
</template>

<style scoped>
.collection {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.title {
  margin: 0 0 6px;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--color-text-high);
}
.sub {
  margin: 0;
  max-width: 62ch;
  font-size: 14px;
  color: var(--color-text-muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.tabs {
  display: flex;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--color-border-subtle);
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar {
  display: none;
}
.tab {
  display: inline-flex;
  flex: 0 0 auto;
  white-space: nowrap;
  align-items: center;
  gap: 8px;
  margin-bottom: -1px;
  padding: 10px 14px;
  border-bottom: 2px solid transparent;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-muted);
  transition:
    color 0.15s,
    border-color 0.15s;
}
.badge {
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #23945a;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: #fff;
}
.tab:hover {
  color: var(--color-text-high);
}
.tab.is-active {
  border-bottom-color: var(--ui-primary);
  color: var(--color-text-high);
}
.panel {
  padding: 36px 24px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: var(--color-surface-1);
}
.center {
  display: grid;
  justify-items: center;
  gap: 12px;
  text-align: center;
  color: var(--color-text-mid);
}
</style>
