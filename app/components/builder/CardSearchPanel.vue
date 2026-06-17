<script setup lang="ts">
import type { CardTypeFilter } from '~/composables/useCardSearch'
import type { ManaColor } from '~/composables/useManaIdentity'
import type { ScryfallCard } from '~/composables/useScryfall'
import { computed, reactive, ref, watch } from 'vue'
import { emptyFilters, SEARCH_THEMES, useCardSearch } from '~/composables/useCardSearch'
import { useLocale } from '~/composables/useLocale'
import { useManaIdentity } from '~/composables/useManaIdentity'

const props = defineProps<{
  /** Commander color identity to constrain results (null = no constraint). */
  identity: ManaColor[] | null
  /** Names already in the deck (lowercased) to mark as added. */
  inDeck: Set<string>
  /** Commander name — enables EDHREC suggestions when set. */
  commanderName?: string
}>()

const emit = defineEmits<{
  add: [card: ScryfallCard]
  details: [card: ScryfallCard]
}>()

const { t, isFr, locale } = useLocale()
const { colorVar } = useManaIdentity()
const { state, search, loadMore, suggest } = useCardSearch()

const suggestMode = ref(false)
function showSuggestions() {
  if (!props.commanderName)
    return
  suggestMode.value = true
  suggest(props.commanderName, locale.value)
}

const filters = reactive(emptyFilters())

const ctx = computed(() => ({ identity: props.identity, lang: locale.value }))

const TYPE_OPTIONS: { value: string, key: string }[] = [
  { value: 'any', key: 'build.anyType' },
  { value: 'creature', key: 'type.creature' },
  { value: 'instant', key: 'type.instant' },
  { value: 'sorcery', key: 'type.sorcery' },
  { value: 'artifact', key: 'type.artifact' },
  { value: 'enchantment', key: 'type.enchantment' },
  { value: 'planeswalker', key: 'type.planeswalker' },
  { value: 'land', key: 'type.land' },
]

const typeModel = computed({
  get: () => (filters.type || 'any'),
  set: (v: string) => {
    filters.type = (v === 'any' ? '' : v) as CardTypeFilter
    runSearch()
  },
})

const COLOR_PIPS: { c: ManaColor, label: string }[] = [
  { c: 'w', label: 'W' },
  { c: 'u', label: 'U' },
  { c: 'b', label: 'B' },
  { c: 'r', label: 'R' },
  { c: 'g', label: 'G' },
]

function toggleColor(c: ManaColor) {
  const i = filters.colors.indexOf(c)
  if (i >= 0)
    filters.colors.splice(i, 1)
  else filters.colors.push(c)
  runSearch()
}

function toggleTheme(key: string) {
  const i = filters.themes.indexOf(key)
  if (i >= 0)
    filters.themes.splice(i, 1)
  else filters.themes.push(key)
  runSearch()
}

const hasActiveQuery = computed(() =>
  !!filters.text.trim() || filters.themes.length > 0 || !!filters.type
  || !!filters.subtype.trim() || filters.maxCmc != null || filters.colors.length > 0,
)

let debounce: ReturnType<typeof setTimeout> | null = null
function runSearch() {
  suggestMode.value = false
  if (!hasActiveQuery.value) {
    state.value.cards = []
    state.value.total = 0
    return
  }
  search(filters, ctx.value)
}
function debouncedSearch() {
  if (debounce)
    clearTimeout(debounce)
  debounce = setTimeout(runSearch, 350)
}

// Re-run when the commander identity or locale changes.
watch(ctx, () => {
  if (hasActiveQuery.value)
    runSearch()
})

function cardName(c: ScryfallCard): string {
  return isFr.value ? (c.printed_name ?? c.name) : c.name
}
function cardImage(c: ScryfallCard): string | null {
  return c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? null
}
function priceLabel(c: ScryfallCard): string {
  return c.prices?.eur ? `${c.prices.eur} €` : ''
}

const maxCmcModel = computed({
  get: () => filters.maxCmc ?? 0,
  set: (v: number) => {
    filters.maxCmc = v > 0 ? v : null
    runSearch()
  },
})
</script>

<template>
  <div class="glass-solid flex h-full flex-col rounded-[var(--radius-xl)] p-4">
    <h3 class="mb-3 font-mono text-[11px] uppercase tracking-[2px] text-(--color-text-muted)">
      {{ t('build.searchTitle') }}
    </h3>

    <!-- Free text -->
    <UInput
      v-model="filters.text"
      name="card-search"
      :placeholder="t('build.searchPlaceholder')"
      icon="i-lucide-search"
      class="mb-3 w-full"
      @update:model-value="debouncedSearch"
    />

    <!-- Color pips -->
    <div class="mb-3 flex items-center gap-2">
      <span class="font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">{{ t('build.colors') }}</span>
      <div class="flex gap-1.5">
        <button
          v-for="pip in COLOR_PIPS"
          :key="pip.c"
          type="button"
          class="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ring-2 transition-all"
          :style="{
            'background': filters.colors.includes(pip.c) ? colorVar(pip.c) : 'transparent',
            'color': filters.colors.includes(pip.c) ? 'var(--color-bg-base)' : colorVar(pip.c),
            '--tw-ring-color': colorVar(pip.c),
          }"
          :aria-pressed="filters.colors.includes(pip.c)"
          @click="toggleColor(pip.c)"
        >
          {{ pip.label }}
        </button>
      </div>
    </div>

    <!-- Themes -->
    <div class="mb-3 flex flex-wrap gap-1.5">
      <button
        v-for="theme in SEARCH_THEMES"
        :key="theme.key"
        type="button"
        class="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-all"
        :class="filters.themes.includes(theme.key)
          ? 'accent-border-c accent-soft-bg text-(--accent-text)'
          : 'border-(--color-border-subtle) text-(--color-text-muted) hover:border-(--color-border-strong)'"
        @click="toggleTheme(theme.key)"
      >
        <UIcon :name="theme.icon" class="h-3.5 w-3.5" />
        {{ t(theme.labelKey) }}
      </button>
    </div>

    <!-- EDHREC suggestions (only when a commander is set) -->
    <button
      v-if="commanderName"
      type="button"
      class="mb-3 flex items-center justify-center gap-1.5 self-start rounded-full border px-3 py-1 text-xs transition-all"
      :class="suggestMode
        ? 'accent-border-c accent-soft-bg text-(--accent-text)'
        : 'border-(--accent-border) text-(--accent-text) hover:bg-(--accent-soft)'"
      @click="showSuggestions"
    >
      <UIcon name="i-lucide-wand-sparkles" class="h-3.5 w-3.5" />
      {{ t('build.suggestions') }}
    </button>

    <!-- Filters row -->
    <div class="mb-3 grid grid-cols-2 gap-2">
      <USelect
        v-model="typeModel"
        :items="TYPE_OPTIONS.map(o => ({ label: t(o.key), value: o.value }))"
      />
      <UInput
        v-model="filters.subtype"
        name="subtype"
        :placeholder="t('build.subtype')"
        @update:model-value="debouncedSearch"
      />
    </div>

    <div class="mb-4 flex items-center gap-3">
      <label class="font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
        {{ t('build.maxCmc') }}
      </label>
      <input
        v-model.number="maxCmcModel"
        type="range"
        min="0"
        max="10"
        step="1"
        class="flex-1 accent-(--accent)"
        aria-label="Max CMC"
      >
      <span class="w-6 text-center font-mono text-sm text-(--color-text-high)">
        {{ filters.maxCmc ?? '∞' }}
      </span>
    </div>

    <!-- Identity note -->
    <p v-if="identity" class="mb-3 flex items-center gap-1.5 font-mono text-[10px] text-(--color-text-muted)">
      <UIcon name="i-lucide-shield-check" class="h-3 w-3 text-(--accent-text)" />
      {{ t('build.identityNote') }}
    </p>

    <!-- Results meta -->
    <div class="mb-2 flex items-center justify-between text-xs text-(--color-text-muted)">
      <span v-if="state.loading">{{ t('build.searching') }}</span>
      <span v-else-if="state.total">{{ state.total }} {{ t('build.results') }}</span>
      <span v-else />
    </div>

    <!-- Results grid (scrollable) -->
    <div class="-mr-2 flex-1 overflow-y-auto pr-2">
      <p v-if="!hasActiveQuery && !suggestMode && !state.cards.length" class="py-10 text-center text-sm text-(--color-text-muted)">
        {{ t('build.searchHint') }}
      </p>
      <p v-else-if="!state.loading && !state.cards.length" class="py-10 text-center text-sm text-(--color-text-muted)">
        {{ t('build.noResults') }}
      </p>

      <div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div
          v-for="card in state.cards"
          :key="card.id"
          class="group relative overflow-hidden rounded-[var(--radius-md)]"
        >
          <button type="button" class="block w-full" @click="emit('details', card)">
            <img
              v-if="cardImage(card)"
              :src="cardImage(card)!"
              :alt="cardName(card)"
              loading="lazy"
              class="block w-full rounded-[var(--radius-md)]"
            >
            <div
              v-else
              class="flex aspect-[63/88] items-center justify-center rounded-[var(--radius-md)] bg-(--color-surface-2) p-1 text-center text-[10px] text-(--color-text-muted)"
            >
              {{ cardName(card) }}
            </div>
          </button>

          <!-- price tag -->
          <span
            v-if="priceLabel(card)"
            class="pointer-events-none absolute left-1 top-1 rounded bg-black/70 px-1 py-0.5 font-mono text-[9px] text-white"
          >{{ priceLabel(card) }}</span>

          <!-- add overlay -->
          <div class="pointer-events-none absolute inset-x-0 bottom-0 flex gap-1 p-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              class="pointer-events-auto flex flex-1 items-center justify-center gap-1 rounded-[var(--radius-sm)] py-1 text-xs font-semibold text-(--color-bg-base)"
              :style="{ background: inDeck.has(card.name.toLowerCase()) ? 'var(--color-success)' : 'var(--accent)' }"
              @click="emit('add', card)"
            >
              <UIcon :name="inDeck.has(card.name.toLowerCase()) ? 'i-lucide-check' : 'i-lucide-plus'" class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="state.hasMore && state.cards.length" class="mt-3 flex justify-center">
        <UButton
          color="neutral"
          variant="subtle"
          size="sm"
          :loading="state.loading"
          @click="loadMore(filters, ctx)"
        >
          {{ t('build.loadMore') }}
        </UButton>
      </div>
    </div>
  </div>
</template>
