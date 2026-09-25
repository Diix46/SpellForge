<script setup lang="ts">
import type { OptcgCategory, OptcgColor } from '#shared/optcg/rules'
import type { OptcgCard, OptcgSortOrder } from '#shared/optcg/types'
import type { OptcgFilters } from '~/composables/useOptcgSearch'
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { OPTCG_COLORS } from '#shared/optcg/rules'
import { OPTCG_COLOR_HEX, optcgColorFill } from '~/utils/optcgColors'

// Every One Piece search control: text with card suggestions, category,
// colours, cost range, set, format and sort. Edits the filters in place and
// emits `change` (at once) or `textInput` (debounced by the parent).
const props = defineProps<{
  lang: 'fr' | 'en'
  /** Colours fixed by the deck's Leader; the colour chips then only narrow within them. */
  leaderColors?: OptcgColor[] | null
  /** Categories the context allows (a deck without Leader shows Leaders only). */
  categories?: OptcgCategory[]
  autocomplete: (text: string, lang: 'fr' | 'en') => Promise<OptcgCard[]>
}>()

const emit = defineEmits<{
  change: []
  textInput: []
  /** A suggestion was picked: open that card. */
  pick: [card: OptcgCard]
}>()

const filters = defineModel<OptcgFilters>('filters', { required: true })
const { t } = useLocale()

const ALL_CATEGORIES: OptcgCategory[] = ['Leader', 'Character', 'Event', 'Stage']
const categoryOptions = computed(() => props.categories ?? ALL_CATEGORIES)
const colorOptions = computed<readonly OptcgColor[]>(() => props.leaderColors?.length ? props.leaderColors : OPTCG_COLORS)

const SORTS: OptcgSortOrder[] = ['number', 'cost', 'power', 'name']

// Phones: filters folded until asked for; the count says how many are on.
const openFilters = ref(false)
const activeFilters = computed(() => {
  const f = filters.value
  return [f.category, f.colors.length, f.costMin != null || f.costMax != null, f.set, f.legalOnly, f.counterOnly].filter(Boolean).length
})

interface SetOption { code: string, name: string, cards: number }
// Fetched with the page, so a server-rendered library lists the sets too.
const { data: setsData } = useFetch<{ sets: SetOption[] }>('/api/optcg/sets', {
  query: computed(() => ({ lang: props.lang })),
  default: () => ({ sets: [] }),
})
const sets = computed(() => setsData.value?.sets ?? [])

const setItems = computed(() => [
  { label: t('optcg.filter.anySet'), value: 'any' },
  // A set without a readable name shows its code once.
  ...sets.value.map(s => ({ label: s.name && s.name !== s.code ? `${s.code} · ${s.name}` : s.code, value: s.code })),
])
const setModel = computed({
  get: () => filters.value.set || 'any',
  set: (v: string) => {
    filters.value.set = v === 'any' ? '' : v
    emit('change')
  },
})
const sortModel = computed({
  get: () => filters.value.order,
  set: (v: OptcgSortOrder) => {
    filters.value.order = v
    emit('change')
  },
})
const costMinModel = computed({
  get: () => filters.value.costMin ?? 0,
  set: (v: number) => {
    filters.value.costMin = v > 0 ? v : null
    if (filters.value.costMax != null && filters.value.costMax < v)
      filters.value.costMax = v
    emit('change')
  },
})
const costMaxModel = computed({
  get: () => filters.value.costMax ?? 10,
  set: (v: number) => {
    filters.value.costMax = v < 10 ? v : null
    if (filters.value.costMin != null && filters.value.costMin > v)
      filters.value.costMin = v
    emit('change')
  },
})

function setCategory(c: OptcgCategory | '') {
  filters.value.category = filters.value.category === c ? '' : c
  emit('change')
}
function toggleColor(c: OptcgColor) {
  const i = filters.value.colors.indexOf(c)
  if (i >= 0)
    filters.value.colors.splice(i, 1)
  else filters.value.colors.push(c)
  emit('change')
}
function toggle(key: 'legalOnly' | 'counterOnly') {
  filters.value[key] = !filters.value[key]
  emit('change')
}
function reset() {
  Object.assign(filters.value, { text: '', category: '', colors: [], costMin: null, costMax: null, set: '', legalOnly: false, counterOnly: false })
  emit('change')
}

// Card suggestions while typing: a card, not a name, since names repeat.
const suggestions = shallowRef<OptcgCard[]>([])
const showSuggestions = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0
function onText(value: string) {
  filters.value.text = value
  emit('textInput')
  if (timer)
    clearTimeout(timer)
  timer = setTimeout(async () => {
    const id = ++seq
    const found = await props.autocomplete(value, props.lang)
    if (id !== seq)
      return
    suggestions.value = found.slice(0, 8)
    showSuggestions.value = found.length > 0
  }, 200)
}
function pick(card: OptcgCard) {
  showSuggestions.value = false
  emit('pick', card)
}
function hideSoon() {
  setTimeout(() => (showSuggestions.value = false), 120)
}
onBeforeUnmount(() => timer && clearTimeout(timer))
</script>

<template>
  <div class="rail">
    <div class="relative">
      <UInput
        :model-value="filters.text"
        name="optcg-search"
        :aria-label="t('optcg.search.placeholder')"
        :aria-expanded="showSuggestions"
        :placeholder="t('optcg.search.placeholder')"
        icon="i-lucide-search"
        autocomplete="off"
        class="w-full"
        @update:model-value="onText(String($event))"
        @focus="showSuggestions = suggestions.length > 0"
        @keydown.escape="showSuggestions = false"
        @blur="hideSoon"
      />
      <ul v-if="showSuggestions" role="listbox" class="suggest">
        <li v-for="card in suggestions" :key="card.number">
          <button type="button" role="option" class="suggest-item" @mousedown.prevent="pick(card)">
            <img :src="card.thumb" alt="" loading="lazy" class="suggest-thumb">
            <span class="min-w-0 flex-1">
              <span class="block truncate">{{ card.name }}</span>
              <span class="block font-mono text-[10.5px] text-(--color-text-muted)">
                {{ card.number }} · {{ t(`optcg.category.${card.category}`) }}
              </span>
            </span>
            <span class="suggest-dot" :style="{ background: optcgColorFill(card.colors) }" />
          </button>
        </li>
      </ul>
    </div>

    <button type="button" class="filters-toggle" :aria-expanded="openFilters" @click="openFilters = !openFilters">
      <UIcon name="i-lucide-sliders-horizontal" class="h-4 w-4" />
      {{ t('filters.toggle') }}<template v-if="activeFilters">
        ({{ activeFilters }})
      </template>
      <UIcon :name="openFilters ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="ml-auto h-4 w-4" />
    </button>
    <div class="rest" :class="{ shut: !openFilters }">
      <section class="grp">
        <h4 class="grp-title">
          {{ t('optcg.filter.category') }}
        </h4>
        <div class="chips">
          <button
            v-for="c in categoryOptions"
            :key="c"
            type="button"
            class="chip"
            :aria-pressed="filters.category === c"
            @click="setCategory(c)"
          >
            {{ t(`optcg.category.${c}`) }}
          </button>
        </div>
      </section>

      <section class="grp">
        <h4 class="grp-title">
          {{ leaderColors?.length ? t('optcg.filter.colorsLocked') : t('optcg.filter.colors') }}
        </h4>
        <div class="pips">
          <button
            v-for="c in colorOptions"
            :key="c"
            type="button"
            class="pip"
            :style="{ '--pip': OPTCG_COLOR_HEX[c] }"
            :aria-pressed="filters.colors.includes(c)"
            :aria-label="t(`optcg.color.${c}`)"
            :title="t(`optcg.color.${c}`)"
            @click="toggleColor(c)"
          />
        </div>
      </section>

      <section class="grp">
        <h4 class="grp-title">
          {{ t('optcg.filter.cost') }}
          <span class="font-mono normal-case tracking-normal text-(--color-text-high)">
            {{ filters.costMin ?? 0 }}-{{ filters.costMax ?? '10+' }}
          </span>
        </h4>
        <div class="costs">
          <label class="cost-row">
            <span>min</span>
            <input v-model.number="costMinModel" type="range" min="0" max="10" :aria-label="`${t('optcg.filter.cost')} min`">
          </label>
          <label class="cost-row">
            <span>max</span>
            <input v-model.number="costMaxModel" type="range" min="0" max="10" :aria-label="`${t('optcg.filter.cost')} max`">
          </label>
        </div>
      </section>

      <section class="grp">
        <USelect v-model="setModel" :items="setItems" :aria-label="t('optcg.filter.set')" class="w-full" />
      </section>

      <section class="grp toggles">
        <button type="button" class="chip" :aria-pressed="filters.legalOnly" @click="toggle('legalOnly')">
          <UIcon name="i-lucide-shield-check" class="h-3.5 w-3.5" />
          {{ t('optcg.filter.legal') }}
        </button>
        <button type="button" class="chip" :aria-pressed="filters.counterOnly" @click="toggle('counterOnly')">
          <UIcon name="i-lucide-shield" class="h-3.5 w-3.5" />
          {{ t('optcg.filter.counter') }}
        </button>
      </section>

      <section class="grp sort">
        <label class="grp-title" for="optcg-sort">{{ t('optcg.sort') }}</label>
        <USelect
          id="optcg-sort"
          v-model="sortModel"
          :items="SORTS.map(s => ({ label: t(`optcg.sort.${s}`), value: s }))"
          class="flex-1"
        />
        <button type="button" class="reset" @click="reset">
          {{ t('optcg.filter.reset') }}
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* On a phone the filters fold away under one button; the search stays. */
.filters-toggle {
  display: none;
}
@media (max-width: 900px) {
  .filters-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin: 10px 0 4px;
    padding: 9px 12px;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--color-text-high);
  }
  .rest.shut {
    display: none;
  }
}

.rail {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.rail > * {
  min-width: 0;
}
.grp {
  display: grid;
  gap: 7px;
}
.grp-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  font-family: var(--font-display);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.chips,
.pips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
  color: var(--color-text-mid);
  font-size: 12px;
  transition:
    transform var(--dur-fast) var(--ease-spring),
    background var(--dur-fast) ease,
    color var(--dur-fast) ease;
}
.chip:hover {
  transform: translateY(-1px) rotate(-1deg);
  color: var(--color-text-high);
}
.chip[aria-pressed='true'] {
  border-color: rgb(var(--accent-rgb));
  background: rgb(var(--accent-rgb));
  color: #fff8ec;
}
.pip {
  width: 28px;
  height: 28px;
  border: 2px solid var(--color-text-high);
  border-radius: 50%;
  background: var(--pip);
  opacity: 0.4;
  transition:
    transform var(--dur-fast) var(--ease-spring),
    opacity var(--dur-fast) ease;
}
.pip:hover {
  transform: scale(1.12) rotate(-6deg);
  opacity: 0.75;
}
.pip[aria-pressed='true'] {
  opacity: 1;
  box-shadow:
    0 0 0 2px var(--color-bg-base),
    0 0 0 4px var(--pip);
}
.costs {
  display: grid;
  gap: 2px;
}
.cost-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
}
.cost-row span {
  width: 24px;
}
.cost-row input {
  flex: 1;
  accent-color: rgb(var(--accent-rgb));
}
.toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sort {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.sort > :deep(*) {
  min-width: 0;
}
.reset {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-muted);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.reset:hover {
  color: var(--accent-text);
}
.suggest {
  position: absolute;
  z-index: 30;
  margin-top: 4px;
  width: 100%;
  max-height: 320px;
  overflow: auto;
  padding: 4px 0;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--glass-bg-strong);
  box-shadow: var(--shadow-elev-3);
  backdrop-filter: blur(8px);
}
.suggest-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 5px 10px;
  text-align: left;
  font-size: 13px;
  color: var(--color-text-mid);
}
.suggest-item:hover {
  background: var(--color-surface-2);
  color: var(--color-text-high);
}
.suggest-thumb {
  width: 28px;
  aspect-ratio: 600 / 838;
  border-radius: 2px;
  object-fit: cover;
}
.suggest-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
</style>
