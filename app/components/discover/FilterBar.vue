<script setup lang="ts">
import type { DiscoverFilters } from '~/composables/useDiscoverFilters'
import { computed, watch } from 'vue'
import { OPTCG_COLORS } from '#shared/optcg/rules'
import { OPTCG_COLOR_HEX } from '~/utils/optcgColors'

defineProps<{ count: number, active: boolean }>()
const emit = defineEmits<{ reset: [] }>()
// The gallery's filters: search, game, colours of that game, complete decks,
// how recent, the order. It edits the filters the page owns (v-model).
const filters = defineModel<DiscoverFilters>({ required: true })
const { t } = useLocale()

const GAMES = [
  { value: 'all' as const, label: () => t('discover.all') },
  { value: 'optcg' as const, label: () => 'One Piece' },
  { value: 'mtg' as const, label: () => 'Magic' },
]
const MTG_COLORS = ['W', 'U', 'B', 'R', 'G', 'C']
const sortItems = computed(() => [
  { label: t('discover.sortRecent'), value: 'recent' },
  { label: t('discover.sortName'), value: 'name' },
  { label: t('discover.sortSize'), value: 'size' },
])
const periodItems = computed(() => [
  { label: t('discover.periodAll'), value: 'all' },
  { label: t('discover.period7'), value: '7' },
  { label: t('discover.period30'), value: '30' },
  { label: t('discover.period365'), value: '365' },
])

// Colours belong to one game: another game starts without them.
watch(() => filters.value.game, () => {
  filters.value.colors = []
})
function toggleColor(c: string) {
  const cs = filters.value.colors
  filters.value.colors = cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]
}
</script>

<template>
  <div class="bar">
    <div class="row">
      <UInput
        v-model="filters.q"
        icon="i-lucide-search"
        :placeholder="t('discover.searchPlaceholder')"
        class="search"
        :ui="{ trailing: 'pe-1' }"
      >
        <template v-if="filters.q" #trailing>
          <UButton color="neutral" variant="link" size="sm" icon="i-lucide-x" :aria-label="t('discover.clear')" @click="filters.q = ''" />
        </template>
      </UInput>
      <div class="seg" role="group" :aria-label="t('nav.games')">
        <button
          v-for="g in GAMES"
          :key="g.value"
          type="button"
          :class="`seg--${g.value}`"
          :aria-pressed="filters.game === g.value"
          @click="filters.game = g.value"
        >
          {{ g.label() }}
        </button>
      </div>
      <USelect v-model="filters.period" :items="periodItems" icon="i-lucide-calendar" class="w-44" :aria-label="t('discover.period')" />
      <USelect v-model="filters.sort" :items="sortItems" icon="i-lucide-arrow-down-wide-narrow" class="w-44" :aria-label="t('discover.sort')" />
    </div>

    <div class="row row--sub">
      <div v-if="filters.game === 'mtg'" class="colors" role="group" :aria-label="t('discover.colors')">
        <button
          v-for="c in MTG_COLORS"
          :key="c"
          type="button"
          class="chip"
          :aria-pressed="filters.colors.includes(c)"
          :aria-label="c"
          @click="toggleColor(c)"
        >
          <ManaSymbol :sym="c" :size="20" />
        </button>
      </div>
      <div v-else-if="filters.game === 'optcg'" class="colors" role="group" :aria-label="t('discover.colors')">
        <button
          v-for="c in OPTCG_COLORS"
          :key="c"
          type="button"
          class="chip"
          :aria-pressed="filters.colors.includes(c)"
          :aria-label="t(`optcg.color.${c}`)"
          :title="t(`optcg.color.${c}`)"
          @click="toggleColor(c)"
        >
          <span class="dot" :style="{ background: OPTCG_COLOR_HEX[c] }" />
        </button>
      </div>
      <span v-else class="hint">{{ t('discover.colorsHint') }}</span>

      <USwitch v-model="filters.complete" :label="t('discover.completeOnly')" />

      <span class="count">{{ t('discover.count').replace('{n}', String(count)) }}</span>
      <UButton v-if="active" color="neutral" variant="ghost" size="sm" icon="i-lucide-rotate-ccw" @click="emit('reset')">
        {{ t('discover.reset') }}
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.bar {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: var(--color-surface-1);
  box-shadow: var(--shadow-elev-1);
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.row--sub {
  gap: 14px;
  min-height: 32px;
}
.search {
  flex: 1 1 260px;
  min-width: 220px;
}
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-sm);
}
.seg button {
  padding: 5px 11px;
  border-radius: calc(var(--radius-sm) - 2px);
  font-size: 13px;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.seg button[aria-pressed='true'] {
  background: var(--color-surface-3);
  color: var(--color-text-high);
}
.seg--optcg {
  font-family: 'Anton', Impact, sans-serif;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.seg--mtg {
  font-family: var(--mtg-face);
  font-weight: 700;
}
.colors {
  display: flex;
  gap: 6px;
}
.chip {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border-hairline);
  border-radius: 50%;
  opacity: 0.55;
  transition:
    opacity var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.chip:hover {
  opacity: 0.85;
  transform: translateY(-1px);
}
.chip[aria-pressed='true'] {
  opacity: 1;
  border-color: var(--accent-border);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
}
.hint {
  font-size: 13px;
  color: var(--color-text-muted);
}
.count {
  margin-left: auto;
  font-size: 13px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
