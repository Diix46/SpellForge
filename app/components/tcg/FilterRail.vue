<script setup lang="ts">
import type { TcgCard, TcgGameId, TcgSet, TcgSortOrder } from '#shared/tcg/types'
import type { TcgFilters } from '~/composables/useTcgSearch'
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { TCG_RULES } from '#shared/tcg/rules'
import { TCG_UI, tcgLabel } from '~/utils/games/tcg'

// Every search control of a generic-engine game: text with card suggestions,
// category and subtype, types, set, rarity, format and sort. Edits the filters
// in place and emits `change` (at once) or `textInput` (debounced by the parent).
const props = defineProps<{
  game: TcgGameId
  lang: 'fr' | 'en'
  autocomplete: (text: string, lang: 'fr' | 'en') => Promise<TcgCard[]>
}>()

const emit = defineEmits<{
  change: []
  textInput: []
  pick: [card: TcgCard]
}>()

const filters = defineModel<TcgFilters>('filters', { required: true })
const { t } = useLocale()
const ui = computed(() => TCG_UI[props.game])
const label = (kind: string, v: string) => tcgLabel(t, props.game, kind, v)
// Pokémon's types, Yu-Gi-Oh!'s attributes, Riftbound's domains.
const typesTitle = computed(() => {
  const own = t(`${props.game}.filter.types`)
  return own === `${props.game}.filter.types` ? t('tcg.filter.types') : own
})
const SORTS: TcgSortOrder[] = ['recent', 'name', 'number', 'price']

const openFilters = ref(false)
const activeFilters = computed(() => {
  const f = filters.value
  return [f.category, f.subtype, f.types.length, f.rarity, f.set, f.format].filter(Boolean).length
})

// Fetched with the page, so a server-rendered library lists the sets too.
const { data: setsData } = useFetch<{ sets: (TcgSet & { cards: number })[] }>(() => `/api/tcg/${props.game}/sets`, {
  query: computed(() => ({ lang: props.lang })),
  default: () => ({ sets: [] }),
})
const setItems = computed(() => {
  const bySeries = new Map<string, { label: string, value: string }[]>()
  for (const s of setsData.value?.sets ?? []) {
    const list = bySeries.get(s.series ?? '') ?? []
    list.push({ label: `${s.name} · ${s.code}`, value: s.code })
    bySeries.set(s.series ?? '', list)
  }
  return [[{ label: t('tcg.filter.anySet'), value: 'any' }], ...[...bySeries.entries()].map(([series, items]) => [{ type: 'label' as const, label: series }, ...items])]
})
const setModel = computed({
  get: () => filters.value.set || 'any',
  set: (v: string) => {
    filters.value.set = v === 'any' ? '' : v
    emit('change')
  },
})
const rarityItems = computed(() => [{ label: t('tcg.filter.anyRarity'), value: 'any' }, ...ui.value.rarityOrder.filter(r => r !== 'None').map(r => ({ label: label('rarity', r), value: r }))])
const rarityModel = computed({
  get: () => filters.value.rarity || 'any',
  set: (v: string) => {
    filters.value.rarity = v === 'any' ? '' : v
    emit('change')
  },
})
const sortModel = computed({
  get: () => filters.value.order,
  set: (v: TcgSortOrder) => {
    filters.value.order = v
    emit('change')
  },
})
const subtypes = computed(() => (filters.value.category ? ui.value.subtypes[filters.value.category] ?? [] : []))

function setCategory(c: string) {
  filters.value.category = filters.value.category === c ? '' : c
  filters.value.subtype = ''
  emit('change')
}
function setSubtype(s: string) {
  filters.value.subtype = filters.value.subtype === s ? '' : s
  emit('change')
}
function toggleType(ty: string) {
  const i = filters.value.types.indexOf(ty)
  if (i >= 0)
    filters.value.types.splice(i, 1)
  else filters.value.types.push(ty)
  emit('change')
}
function setFormat(f: string) {
  filters.value.format = filters.value.format === f ? '' : f
  emit('change')
}
function reset() {
  Object.assign(filters.value, { text: '', category: '', subtype: '', types: [], rarity: '', set: '', format: '' })
  emit('change')
}

// Suggestions while typing: one printing per name.
const suggestions = shallowRef<TcgCard[]>([])
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
function pick(card: TcgCard) {
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
        :name="`${game}-search`"
        :aria-label="t('tcg.search.placeholder')"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="showSuggestions"
        :placeholder="t('tcg.search.placeholder')"
        icon="i-lucide-search"
        autocomplete="off"
        class="w-full"
        @update:model-value="onText(String($event))"
        @focus="showSuggestions = suggestions.length > 0"
        @keydown.escape="showSuggestions = false"
        @blur="hideSoon"
      />
      <ul v-if="showSuggestions" role="listbox" class="suggest">
        <li v-for="card in suggestions" :key="card.id">
          <button type="button" role="option" class="suggest-item" @mousedown.prevent="pick(card)">
            <TcgThumb :src="card.thumb" class="suggest-thumb" />
            <span class="min-w-0 flex-1">
              <span class="block truncate">{{ card.name }}</span>
              <span class="block font-mono text-[10.5px] text-(--color-text-muted)">
                {{ card.set }} · {{ label('category', card.category) }}
              </span>
            </span>
            <TcgTypeIcon v-for="ty in card.types.slice(0, 2)" :key="ty" :game="game" :type="ty" :size="14" />
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
          {{ t('tcg.filter.category') }}
        </h4>
        <div class="chips">
          <button v-for="c in ui.categories" :key="c" type="button" class="chip" :aria-pressed="filters.category === c" @click="setCategory(c)">
            {{ label('category', c) }}
          </button>
        </div>
        <div v-if="subtypes.length" class="chips">
          <button v-for="s in subtypes" :key="s" type="button" class="chip chip--sub" :aria-pressed="filters.subtype === s" @click="setSubtype(s)">
            {{ label('subtype', s) }}
          </button>
        </div>
      </section>

      <section class="grp">
        <h4 class="grp-title">
          {{ typesTitle }}
        </h4>
        <div class="pips">
          <button
            v-for="ty in ui.types"
            :key="ty"
            type="button"
            class="pip"
            :aria-pressed="filters.types.includes(ty)"
            :aria-label="label('type', ty)"
            @click="toggleType(ty)"
          >
            <TcgTypeIcon :game="game" :type="ty" :size="26" />
          </button>
        </div>
      </section>

      <section class="grp">
        <USelect v-model="setModel" :items="setItems" :aria-label="t('tcg.filter.set')" class="w-full" />
        <USelect v-model="rarityModel" :items="rarityItems" :aria-label="t('tcg.filter.rarity')" class="w-full" />
      </section>

      <section class="grp toggles">
        <button v-for="f in TCG_RULES[game].formats" :key="f" type="button" class="chip" :aria-pressed="filters.format === f" @click="setFormat(f)">
          <UIcon name="i-lucide-shield-check" class="h-3.5 w-3.5" />
          {{ t(`tcg.format.${f}`) }}
        </button>
      </section>

      <section class="grp sort">
        <label class="grp-title" :for="`${game}-sort`">{{ t('tcg.sort') }}</label>
        <USelect :id="`${game}-sort`" v-model="sortModel" :items="SORTS.map(s => ({ label: t(`tcg.sort.${s}`), value: s }))" class="flex-1" />
        <button type="button" class="reset" @click="reset">
          {{ t('tcg.filter.reset') }}
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
  color: var(--color-text-high);
}
.chip--sub {
  padding: 3px 8px;
  font-size: 11px;
}
.chip[aria-pressed='true'] {
  border-color: rgb(var(--accent-rgb));
  background: rgb(var(--accent-rgb));
  color: #fff8ec;
}
.pip {
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  opacity: 0.45;
  transition:
    transform var(--dur-fast) var(--ease-spring),
    opacity var(--dur-fast) ease;
}
.pip:hover {
  opacity: 0.75;
}
.pip[aria-pressed='true'] {
  opacity: 1;
  box-shadow:
    0 0 0 2px var(--color-bg-base),
    0 0 0 4px rgb(var(--accent-rgb));
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
/* The order's name whole (« Plus récentes »): the select takes the row's
   room, the reset link goes under it when it must. */
.sort > :deep(button[role='combobox']),
.sort > :deep(.flex-1) {
  flex: 1 1 150px;
  min-width: 150px;
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
  aspect-ratio: 63 / 88;
  border-radius: 2px;
  object-fit: cover;
}
</style>
