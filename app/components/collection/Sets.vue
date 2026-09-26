<script setup lang="ts">
import type { GameId } from '#shared/game'
import { computed } from 'vue'

// How far the collection goes into each set: the overall progress over the
// sets started, then a card per set (symbol, name, bar), filtered and sorted;
// each opens the set's checklist.
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

    <div v-else class="grid">
      <NuxtLink
        v-for="s in view.shown.value"
        :key="s.code"
        :to="collectionPath(game, `/sets/${s.code}`)"
        class="set"
        :class="{ 'is-done': s.owned >= s.total, 'is-new': !s.owned }"
      >
        <div class="set-top">
          <span class="emblem">
            <CollectionSetSymbol v-if="s.icon" :icon="s.icon" :rarity="s.owned >= s.total ? 'rare' : null" :size="26" />
            <b v-else>{{ s.code.replace('-', '') }}</b>
          </span>
          <div class="min-w-0">
            <p class="name">
              {{ s.name }}
            </p>
            <p class="meta">
              {{ s.code.toUpperCase() }}<template v-if="s.releasedAt">
                · {{ year(s.releasedAt) }}
              </template>
            </p>
          </div>
          <UIcon v-if="s.owned >= s.total" name="i-lucide-trophy" class="trophy" :aria-label="t('collection.complete')" />
        </div>
        <CollectionProgress :owned="s.owned" :total="s.total" />
        <p class="count">
          <span><b>{{ nf.format(s.owned) }}</b> / {{ nf.format(s.total) }}</span>
          <span class="pct">{{ pct(s.owned, s.total) }}%</span>
        </p>
      </NuxtLink>
    </div>
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
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}
.set {
  display: grid;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-surface-1);
  transition:
    transform 0.18s var(--ease-out, ease-out),
    border-color 0.18s,
    box-shadow 0.18s;
}
.set:hover {
  transform: translateY(-2px);
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-elev-1);
}
.set.is-new {
  opacity: 0.72;
}
.set.is-new:hover {
  opacity: 1;
}
.set.is-done {
  border-color: rgba(199, 154, 46, 0.55);
  background: linear-gradient(160deg, rgba(240, 210, 122, 0.14), transparent 55%), var(--color-surface-1);
}
.set-top {
  display: flex;
  align-items: center;
  gap: 12px;
}
.emblem {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--color-surface-2);
}
.emblem b {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-mid);
}
.name {
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-high);
}
.meta {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
}
.trophy {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-left: auto;
  color: #c79a2e;
}
.count {
  display: flex;
  justify-content: space-between;
  margin: 0;
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
