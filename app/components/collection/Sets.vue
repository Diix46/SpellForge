<script setup lang="ts">
import type { GameId } from '#shared/game'
import { computed, onMounted, ref, watch } from 'vue'

// The binder shelf: the overall progress, then the binders of the sets
// started on a 3D bookcase (or as a list), and the other sets to start one.
// Each opens its binder.
const props = defineProps<{ game: GameId }>()

const { t, locale } = useLocale()
const view = useCollectionSets(props.game)
const { filters } = view

const nf = computed(() => new Intl.NumberFormat(locale.value === 'fr' ? 'fr-FR' : 'en-US'))
const pct = (owned: number, total: number) => (total ? Math.floor((owned / total) * 100) : 0)
const year = (d: string | null) => d?.slice(0, 4) ?? ''

const kindItems = computed(() => [
  { label: t('collection.allKinds'), value: 'all' },
  ...view.kinds.value.map(k => ({ label: t(`collection.kind.${k}`), value: k })),
])
// The bookcase or a plain list, as last chosen in this browser.
const MODE_KEY = 'prism_shelf_mode'
const mode = ref<'3d' | 'list'>('3d')
onMounted(() => {
  try {
    if (localStorage.getItem(MODE_KEY) === 'list')
      mode.value = 'list'
  }
  catch {}
})
watch(mode, (m) => {
  try {
    localStorage.setItem(MODE_KEY, m)
  }
  catch {}
})
/** On the bookcase: the binders started; the others wait in the list below. */
const shelfSets = computed(() => (mode.value === '3d' ? view.shown.value.filter(s => s.owned > 0) : []))
const gridSets = computed(() => (mode.value === '3d' ? view.shown.value.filter(s => !s.owned) : view.shown.value))
// The bookcase is built again when what it shows changes.
const shelfKey = computed(() => shelfSets.value.map(s => `${s.code}:${s.owned}`).join('|'))

const sortItems = computed(() => [
  { label: t('collection.setSortRecent'), value: 'recent' },
  { label: t('collection.setSortProgress'), value: 'progress' },
  { label: t('collection.sortName'), value: 'name' },
])
</script>

<template>
  <div class="sets">
    <section class="overall">
      <div class="overall-head">
        <div>
          <p class="label">
            {{ t('collection.overall') }}
          </p>
          <p class="big">
            {{ pct(view.overall.value.owned, view.overall.value.total) }}<small>%</small>
          </p>
        </div>
        <dl class="facts">
          <div>
            <dt>{{ t('collection.cardsLabel') }}</dt>
            <dd>{{ nf.format(view.overall.value.owned) }} <span>/ {{ nf.format(view.overall.value.total) }}</span></dd>
          </div>
          <div>
            <dt>{{ t('collection.setsStarted') }}</dt>
            <dd>{{ nf.format(view.started.value.length) }}</dd>
          </div>
          <div>
            <dt>{{ t('collection.setsComplete') }}</dt>
            <dd>{{ nf.format(view.completed.value) }}</dd>
          </div>
        </dl>
      </div>
      <CollectionProgress :owned="view.overall.value.owned" :total="view.overall.value.total" size="lg" />
    </section>

    <div class="toolbar">
      <UInput v-model="filters.q" icon="i-lucide-search" :placeholder="t('collection.setSearch')" class="grow sm:grow-0 sm:w-64" />
      <USelect v-if="view.kinds.value.length > 1" v-model="filters.kind" :items="kindItems" class="w-44" />
      <USelect v-model="filters.sort" :items="sortItems" icon="i-lucide-arrow-down-wide-narrow" class="w-44" :aria-label="t('discover.sort')" />
      <div class="seg" role="group" :aria-label="t('collection.shelf.mode')">
        <button type="button" :aria-pressed="mode === '3d'" :title="t('collection.shelf.library')" @click="mode = '3d'">
          <UIcon name="i-lucide-library" class="h-4 w-4" /> {{ t('collection.shelf.library') }}
        </button>
        <button type="button" :aria-pressed="mode === 'list'" :title="t('collection.shelf.list')" @click="mode = 'list'">
          <UIcon name="i-lucide-layout-grid" class="h-4 w-4" /> {{ t('collection.shelf.list') }}
        </button>
      </div>
      <div class="switches">
        <USwitch v-model="filters.hideComplete" :label="t('collection.hideComplete')" />
        <USwitch v-model="filters.all" :label="t('collection.showAllSets')" />
      </div>
    </div>

    <div v-if="view.status.value === 'pending' && !view.sets.value.length" class="state" role="status">
      <UIcon name="i-lucide-loader-circle" class="h-7 w-7 animate-spin" />
    </div>
    <div v-else-if="view.error.value" class="state">
      <p>{{ t('collection.error') }}</p>
      <UButton color="neutral" variant="subtle" icon="i-lucide-refresh-cw" @click="view.refresh()">
        {{ t('collection.retry') }}
      </UButton>
    </div>
    <div v-else-if="!view.sets.value.length" class="state">
      <UIcon name="i-lucide-library-big" class="h-8 w-8 text-(--accent-text)" />
      <p>{{ t('collection.noSetsYet') }}</p>
      <UButton color="neutral" variant="subtle" icon="i-lucide-eye" @click="filters.all = true">
        {{ t('collection.showAllSets') }}
      </UButton>
    </div>
    <p v-else-if="!view.shown.value.length" class="state">
      {{ t('collection.noSetMatch') }}
    </p>

    <template v-else>
      <CollectionBookshelf v-if="shelfSets.length" :key="shelfKey" :sets="shelfSets" :game="game" />
      <h3 v-if="shelfSets.length && gridSets.length" class="subhead">
        {{ t('collection.shelf.startNew') }}
      </h3>
      <div v-if="gridSets.length" class="grid">
        <NuxtLink
          v-for="s in gridSets"
          :key="s.code"
          :to="collectionPath(game, `/sets/${s.code}`)"
          class="set"
          :class="{ 'is-done': s.owned >= s.total, 'is-new': !s.owned }"
        >
          <span class="art" :class="{ card: game === 'optcg' }">
            <img v-if="s.art" :src="s.art" alt="" loading="lazy" decoding="async">
            <span class="emblem">
              <CollectionSetSymbol v-if="s.icon" :icon="s.icon" :rarity="s.owned >= s.total ? 'rare' : null" :size="22" />
              <b v-else>{{ s.code.replace('-', '') }}</b>
            </span>
            <UIcon v-if="s.owned >= s.total" name="i-lucide-trophy" class="trophy" :aria-label="t('collection.complete')" />
          </span>
          <span class="body">
            <span class="name" :title="s.name">{{ s.name }}</span>
            <span class="meta">
              {{ s.code.toUpperCase() }}<template v-if="s.releasedAt">
                · {{ year(s.releasedAt) }}
              </template>
            </span>
            <CollectionProgress :owned="s.owned" :total="s.total" />
            <span class="count">
              <span><b>{{ nf.format(s.owned) }}</b> / {{ nf.format(s.total) }}</span>
              <span class="pct">{{ pct(s.owned, s.total) }}%</span>
            </span>
          </span>
        </NuxtLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sets {
  display: grid;
  gap: 18px;
}
.overall {
  display: grid;
  gap: 14px;
  padding: 20px 22px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: radial-gradient(420px 160px at 100% 0%, var(--accent-soft), transparent 70%), var(--color-surface-1);
  box-shadow: var(--shadow-elev-1);
}
.overall-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.label {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.big {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 40px;
  font-weight: 600;
  line-height: 1;
  color: var(--color-text-high);
}
.big small {
  font-size: 20px;
  color: var(--color-text-muted);
}
.facts {
  display: flex;
  gap: 28px;
  margin: 0;
}
.facts dt {
  font-size: 12px;
  color: var(--color-text-muted);
}
.facts dd {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-high);
}
.facts dd span {
  font-size: 13px;
  font-weight: 400;
  color: var(--color-text-muted);
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.switches {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-left: auto;
}
.state {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 44px 0;
  text-align: center;
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: calc(var(--radius-sm) - 2px);
  font-size: 13px;
  color: var(--color-text-muted);
}
.seg button[aria-pressed='true'] {
  background: var(--color-surface-3);
  color: var(--color-text-high);
}
.subhead {
  margin: 6px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-mid);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}
.set {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface-1);
  transition:
    transform 0.18s var(--ease-out, ease-out),
    border-color 0.18s,
    box-shadow 0.18s;
}
.set:hover {
  transform: translateY(-3px);
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-elev-2);
}
.set.is-new {
  opacity: 0.8;
}
.set.is-new:hover {
  opacity: 1;
}
.set.is-done {
  border-color: rgba(199, 154, 46, 0.7);
  box-shadow: 0 0 0 2px rgba(240, 210, 122, 0.25);
}
.art {
  position: relative;
  display: block;
  overflow: hidden;
  height: 104px;
  background: linear-gradient(135deg, var(--color-surface-3), var(--color-surface-2));
}
.art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 30%;
  transition: transform 0.4s var(--ease-out, ease-out);
}
/* One Piece: a whole card, its picture sits high on it. */
.art.card img {
  object-position: center 22%;
}
.set:hover .art img {
  transform: scale(1.05);
}
.set.is-new .art img {
  filter: saturate(0.55);
}
.art::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 45%, rgba(0, 0, 0, 0.45));
}
.emblem {
  position: absolute;
  z-index: 1;
  bottom: -18px;
  left: 12px;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-surface-1);
  border-radius: 50%;
  background: var(--color-surface-2);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}
.emblem b {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--color-text-mid);
}
.trophy {
  position: absolute;
  z-index: 1;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  color: #f0d27a;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
}
.body {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 24px 14px 12px;
}
.name {
  display: block;
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-high);
}
.meta {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
}
.count {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
}
.count b {
  color: var(--color-text-high);
}
.pct {
  font-weight: 600;
  color: var(--color-text-mid);
}
</style>
