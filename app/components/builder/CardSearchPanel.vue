<script setup lang="ts">
import type { ManaColor } from '~/composables/useMtg'
import type { ScryfallCard } from '~/composables/useScryfall'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useCardDnd } from '~/composables/useCardDnd'
import { emptyFilters, useCardSearch } from '~/composables/useCardSearch'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  /** Commander color identity to constrain results (null = no constraint). */
  identity: ManaColor[] | null
  /** Names already in the deck (lowercased) to mark as added. */
  inDeck: Set<string>
  /** Commander name (localized) — enables EDHREC suggestions when set. */
  commanderName?: string
  /** Canonical ENGLISH commander name — used for the EDHREC lookup. */
  commanderEnName?: string
}>()

const emit = defineEmits<{
  add: [card: ScryfallCard]
  remove: [card: ScryfallCard]
  details: [card: ScryfallCard]
  /** A deck card was dropped onto the search panel → remove it from the deck. */
  dropRemove: [name: string]
}>()

const { t, locale } = useLocale()
const { dragging, readDrop } = useCardDnd()
const { state, search, loadMore, suggest, autocomplete } = useCardSearch()

// Drop zone: dragging a DECK card here removes it. Highlight only while a deck
// card is in flight (not when dragging our own search cards out).
const dropActive = ref(false)
const canDropHere = computed(() => dragging.value === 'deck')
function onDragOver(e: DragEvent) {
  if (!canDropHere.value)
    return
  e.preventDefault()
  if (e.dataTransfer)
    e.dataTransfer.dropEffect = 'move'
  dropActive.value = true
}
function onDragLeave(e: DragEvent) {
  // Ignore leaves into child elements; only clear when leaving the panel itself.
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node))
    dropActive.value = false
}
function onDrop(e: DragEvent) {
  dropActive.value = false
  const payload = readDrop(e)
  if (payload?.source === 'deck' && payload.name)
    emit('dropRemove', payload.name)
}

const filters = reactive(emptyFilters())
const suggestMode = ref(false)
const ctx = computed(() => ({ identity: props.identity, lang: locale.value }))

function showSuggestions() {
  // EDHREC only knows English names → use the canonical EN name, not the
  // localized display name (which would slug to an unknown EDHREC page).
  const name = props.commanderEnName || props.commanderName
  if (!name)
    return
  suggestMode.value = true
  suggest(name, locale.value)
}

const hasActiveQuery = computed(() =>
  !!filters.text.trim() || filters.themes.length > 0 || !!filters.type
  || !!filters.subtype.trim() || filters.maxCmc != null || filters.colors.length > 0
  || filters.commanderOnly,
)

let debounce: ReturnType<typeof setTimeout> | null = null
function runSearch() {
  suggestMode.value = false
  if (!hasActiveQuery.value) {
    // No explicit filters → show a sensible default (popular cards in the
    // commander's identity) instead of an empty panel.
    runDefaultSearch()
    return
  }
  search(filters, ctx.value)
}

// Default "browse" results so the panel is never empty: EDHREC-popular cards,
// constrained to the commander's colour identity + commander-legal.
function runDefaultSearch() {
  suggestMode.value = false
  search({ ...emptyFilters(), commanderOnly: filters.commanderOnly }, ctx.value)
}

function debouncedSearch() {
  if (debounce)
    clearTimeout(debounce)
  debounce = setTimeout(runSearch, 350)
}
// Don't let a pending debounce fire after the panel unmounts.
onBeforeUnmount(() => {
  if (debounce)
    clearTimeout(debounce)
})

// Re-run when the commander identity or locale changes. Watch a stable string
// key (not the freshly-allocated ctx object) so equal values don't re-trigger.
// When no explicit filters are set, refresh the default browse results so they
// follow the commander's identity / the site locale.
const ctxKey = computed(() => `${ctx.value.identity?.join('') ?? ''}|${ctx.value.lang}`)
watch(ctxKey, () => {
  if (suggestMode.value)
    showSuggestions() // re-resolve suggestions in the new locale
  else if (hasActiveQuery.value)
    runSearch()
  else
    runDefaultSearch()
})

// Show default browse results immediately on mount (don't make the user type).
onMounted(() => {
  if (!hasActiveQuery.value && !suggestMode.value)
    runDefaultSearch()
})
</script>

<template>
  <div
    class="glass-solid relative flex h-full flex-col rounded-[var(--radius-xl)] p-4"
    :class="{ 'dnd-drop-active': dropActive }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Drop-to-remove hint (only while a deck card is dragged over) -->
    <div v-if="dropActive" class="dnd-hint">
      <UIcon name="i-lucide-trash-2" class="h-5 w-5" />
      {{ t('build.dropToRemove') }}
    </div>

    <h3 class="mb-3 font-mono text-[11px] uppercase tracking-[2px] text-(--color-text-muted)">
      {{ t('build.searchTitle') }}
    </h3>

    <BuilderSearchFilters
      v-model:filters="filters"
      :identity="identity"
      :commander-name="commanderName"
      :suggest-mode="suggestMode"
      :autocomplete="autocomplete"
      @change="runSearch"
      @text-input="debouncedSearch"
      @suggest="showSuggestions"
    />

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
        <BuilderSearchResultCard
          v-for="card in state.cards"
          :key="card.id"
          :card="card"
          :in-deck="inDeck.has(card.name.toLowerCase())"
          @add="emit('add', $event)"
          @remove="emit('remove', $event)"
          @details="emit('details', $event)"
        />
      </div>

      <div v-if="state.hasMore && state.cards.length" class="mt-3 flex justify-center">
        <UButton
          color="neutral"
          variant="subtle"
          size="sm"
          :loading="state.loading"
          @click="loadMore()"
        >
          {{ t('build.loadMore') }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The panel becomes a drop target when a deck card is dragged here (to remove). */
.dnd-drop-active {
  outline: 2px dashed var(--color-error);
  outline-offset: -4px;
}
.dnd-hint {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius-xl);
  background: color-mix(in srgb, var(--color-error) 14%, var(--color-bg-base) 70%);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  color: var(--color-error);
  font-size: 13px;
  font-weight: 600;
  pointer-events: none;
}
</style>
