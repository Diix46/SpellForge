<script setup lang="ts">
import type { CollectionCopy, Condition } from '#shared/collection'
import type { GameId } from '#shared/game'
import type { CopyEdit } from '~/composables/useCollection'
import { computed, ref } from 'vue'

// A member's copies for one game: the totals and filters on the side, the
// copies as a grid or a list, a sheet to edit one.
const props = defineProps<{ game: GameId }>()

const { t, locale } = useLocale()
const toast = useToast()
const collection = useCollection(props.game)
const lang = computed<'fr' | 'en'>(() => (locale.value === 'fr' ? 'fr' : 'en'))
const view = useCollectionView(collection.copies, lang)

const { openAdd } = useCollectionAdd()
const editing = ref<CollectionCopy | null>(null)
const sheetOpen = ref(false)
// Picking several lines for one action (bulk bar).
const selecting = ref(false)
const picked = ref(new Set<string>())
function toggle(id: string) {
  const next = new Set(picked.value)
  if (!next.delete(id))
    next.add(id)
  picked.value = next
}
function edit(copy: CollectionCopy) {
  if (selecting.value) {
    toggle(copy.id)
    return
  }
  editing.value = copy
  sheetOpen.value = true
}

function stopSelecting() {
  selecting.value = false
  picked.value = new Set()
}
const pickedCopies = computed(() => collection.copies.value.filter(c => picked.value.has(c.id)).reduce((n, c) => n + c.quantity, 0))
const pickedIds = () => [...picked.value]
async function bulkCondition(condition: Condition) {
  if (await collection.bulk(pickedIds(), { action: 'edit', fields: { condition } }))
    stopSelecting()
}
async function bulkLocation(location: string | null) {
  if (await collection.bulk(pickedIds(), { action: 'edit', fields: { location } }))
    stopSelecting()
}
async function bulkRemove() {
  const n = picked.value.size
  if (await collection.bulk(pickedIds(), { action: 'delete' })) {
    toast.add({ title: t('collection.bulk.removed').replace('{n}', String(n)), color: 'neutral', icon: 'i-lucide-trash-2' })
    stopSelecting()
  }
}
async function save(id: string, change: CopyEdit) {
  await collection.update(id, change)
}
async function remove(id: string) {
  if (await collection.remove(id))
    toast.add({ title: t('collection.removed'), color: 'neutral', icon: 'i-lucide-minus' })
}
function quantity(copy: CollectionCopy, q: number) {
  void collection.update(copy.id, { quantity: Math.max(0, q) })
}

const sortItems = computed(() => [
  { label: t('collection.sortRecent'), value: 'recent' },
  { label: t('collection.sortName'), value: 'name' },
  ...(props.game === 'mtg' ? [{ label: t('collection.sortValue'), value: 'value' }] : []),
  { label: t('collection.sortSet'), value: 'set' },
])
</script>

<template>
  <div>
    <div v-if="!collection.loaded.value && !collection.error.value" class="panel center" role="status">
      <UIcon name="i-lucide-loader-circle" class="h-7 w-7 animate-spin" />
    </div>

    <section v-else-if="collection.error.value" class="panel center">
      <p>{{ collection.error.value }}</p>
      <UButton color="neutral" variant="subtle" icon="i-lucide-refresh-cw" @click="collection.load(true)">
        {{ t('collection.retry') }}
      </UButton>
    </section>

    <section v-else-if="!collection.copies.value.length" class="panel center empty">
      <div class="empty-art" aria-hidden="true">
        <UIcon name="i-lucide-gem" class="h-8 w-8" />
      </div>
      <h2>{{ t('collection.emptyTitle') }}</h2>
      <p>{{ t('collection.emptyBody') }}</p>
      <UButton icon="i-lucide-plus" size="lg" @click="openAdd()">
        {{ t('collection.add') }}
      </UButton>
    </section>

    <div v-else class="workspace">
      <CollectionSidebar
        v-model="view.filters"
        :game="game"
        :summary="collection.summary.value"
        :sets="view.sets.value"
        :rarities="view.rarities.value"
        :active="view.active.value"
        @reset="view.reset"
      />
      <section class="content">
        <div class="toolbar">
          <span class="shown">{{ t('collection.shown').replace('{n}', String(view.shown.value.length)) }}</span>
          <UButton :color="selecting ? 'primary' : 'neutral'" :variant="selecting ? 'soft' : 'ghost'" icon="i-lucide-list-checks" size="sm" @click="selecting ? stopSelecting() : (selecting = true)">
            {{ t('collection.bulk.select') }}
          </UButton>
          <USelect v-model="view.filters.sort" :items="sortItems" icon="i-lucide-arrow-down-wide-narrow" class="w-48" :aria-label="t('discover.sort')" />
          <div class="seg" role="group">
            <button type="button" :aria-pressed="view.filters.view === 'grid'" :aria-label="t('collection.viewGrid')" :title="t('collection.viewGrid')" @click="view.filters.view = 'grid'">
              <UIcon name="i-lucide-layout-grid" class="h-4 w-4" />
            </button>
            <button type="button" :aria-pressed="view.filters.view === 'list'" :aria-label="t('collection.viewList')" :title="t('collection.viewList')" @click="view.filters.view = 'list'">
              <UIcon name="i-lucide-list" class="h-4 w-4" />
            </button>
          </div>
        </div>

        <p v-if="!view.shown.value.length" class="nomatch">
          {{ t('collection.noMatch') }}
        </p>
        <div v-else-if="view.filters.view === 'grid'" class="grid">
          <CollectionCopyTile v-for="c in view.shown.value" :key="c.id" :copy="c" :name="view.nameOf(c)" :selected="selecting ? picked.has(c.id) : null" @open="edit" />
        </div>
        <div v-else class="list">
          <CollectionCopyRow v-for="c in view.shown.value" :key="c.id" :copy="c" :name="view.nameOf(c)" :selected="selecting ? picked.has(c.id) : null" @open="edit" @quantity="quantity" />
        </div>
        <CollectionBulkBar
          v-if="selecting"
          :count="picked.size"
          :total="view.shown.value.length"
          :copies="pickedCopies"
          @all="picked = new Set(view.shown.value.map(c => c.id))"
          @none="picked = new Set()"
          @condition="bulkCondition"
          @location="bulkLocation"
          @remove="bulkRemove"
          @close="stopSelecting"
        />
      </section>
    </div>

    <CollectionCopySheet v-model:open="sheetOpen" :copy="editing" :name="editing ? view.nameOf(editing) : ''" @save="save" @remove="remove" />
  </div>
</template>

<style scoped>
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
.empty h2 {
  margin: 4px 0 0;
  font-size: 20px;
  color: var(--color-text-high);
}
.empty p {
  max-width: 48ch;
  margin: 0 0 6px;
  line-height: 1.55;
}
.empty-art {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-text);
}
.workspace {
  display: grid;
  grid-template-columns: minmax(250px, 300px) 1fr;
  gap: 24px;
  align-items: start;
}
.content {
  min-width: 0;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.shown {
  margin-right: auto;
  font-size: 13px;
  color: var(--color-text-muted);
}
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-sm);
}
.seg button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 28px;
  border-radius: calc(var(--radius-sm) - 2px);
  color: var(--color-text-muted);
}
.seg button[aria-pressed='true'] {
  background: var(--color-surface-3);
  color: var(--color-text-high);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 22px 16px;
}
.list {
  display: grid;
  gap: 2px;
}
.nomatch {
  padding: 40px 0;
  text-align: center;
  color: var(--color-text-muted);
}
@media (max-width: 900px) {
  .workspace {
    grid-template-columns: 1fr;
  }
}
</style>
