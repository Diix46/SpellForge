<script setup lang="ts">
import type { CardTypeFilter, SortOrder } from '~/composables/useCardSearch'
import type { ManaColor } from '~/composables/useMtg'
import type { ScryfallCard } from '~/composables/useScryfall'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { emptyFilters, SEARCH_THEMES, useCardSearch } from '~/composables/useCardSearch'
import { useLocale } from '~/composables/useLocale'
import { useManaIdentity } from '~/composables/useManaIdentity'
import { displayName, WUBRG } from '~/composables/useMtg'

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
}>()

const { t, isFr, locale } = useLocale()
const { colorVar, colorName, colorCode } = useManaIdentity()
const { state, search, loadMore, suggest, autocomplete } = useCardSearch()

const suggestMode = ref(false)
function showSuggestions() {
  // EDHREC only knows English names → use the canonical EN name, not the
  // localized display name (which would slug to an unknown EDHREC page).
  const name = props.commanderEnName || props.commanderName
  if (!name)
    return
  suggestMode.value = true
  suggest(name, locale.value)
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

// Spawn a colour ripple from the click point inside a mana pip — a quick juicy
// burst that animates out via CSS then removes itself. Skipped under reduced motion.
function spawnRipple(e: MouseEvent) {
  const host = e.currentTarget as HTMLElement
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  const r = host.getBoundingClientRect()
  const ripple = document.createElement('span')
  ripple.className = 'mana-ripple'
  const size = Math.max(r.width, r.height) * 2.4
  ripple.style.width = ripple.style.height = `${size}px`
  ripple.style.left = `${e.clientX - r.left - size / 2}px`
  ripple.style.top = `${e.clientY - r.top - size / 2}px`
  host.appendChild(ripple)
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true })
}

function toggleColor(c: ManaColor, e: MouseEvent) {
  spawnRipple(e)
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

function toggleCommanderOnly() {
  filters.commanderOnly = !filters.commanderOnly
  runSearch()
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

// ---- Name autocomplete (Scryfall /autocomplete) ----
const acItems = ref<string[]>([])
const showAc = ref(false)
let acDebounce: ReturnType<typeof setTimeout> | null = null
let acSeq = 0
async function refreshAutocomplete(text: string) {
  const seq = ++acSeq
  const names = await autocomplete(text)
  if (seq !== acSeq)
    return // a newer keystroke superseded this lookup
  acItems.value = names.slice(0, 8)
  showAc.value = acItems.value.length > 0
}
function pickSuggestion(name: string) {
  filters.text = name
  showAc.value = false
  acItems.value = []
  runSearch()
}
// Delay hiding on blur so a suggestion click (mousedown) still registers.
function hideAcSoon() {
  setTimeout(() => (showAc.value = false), 120)
}

function debouncedSearch() {
  if (debounce)
    clearTimeout(debounce)
  debounce = setTimeout(runSearch, 350)
  if (acDebounce)
    clearTimeout(acDebounce)
  acDebounce = setTimeout(refreshAutocomplete, 200, filters.text)
}

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

function cardName(c: ScryfallCard): string {
  return displayName(c, isFr.value)
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

// Budget filter: max EUR price per card (0 = no limit).
const maxPriceModel = computed({
  get: () => filters.maxPrice ?? 0,
  set: (v: number) => {
    filters.maxPrice = v > 0 ? v : null
    runSearch()
  },
})

const SORT_OPTIONS: { value: SortOrder, key: string }[] = [
  { value: 'edhrec', key: 'sort.edhrec' },
  { value: 'eur', key: 'sort.price' },
  { value: 'name', key: 'sort.name' },
  { value: 'cmc', key: 'sort.cmc' },
]
const sortModel = computed({
  get: () => filters.order,
  set: (v: SortOrder) => {
    filters.order = v
    runSearch()
  },
})
</script>

<template>
  <div class="glass-solid flex h-full flex-col rounded-[var(--radius-xl)] p-4">
    <h3 class="mb-3 font-mono text-[11px] uppercase tracking-[2px] text-(--color-text-muted)">
      {{ t('build.searchTitle') }}
    </h3>

    <!-- Free text + name autocomplete -->
    <div class="relative mb-3">
      <UInput
        v-model="filters.text"
        name="card-search"
        :placeholder="t('build.searchPlaceholder')"
        icon="i-lucide-search"
        autocomplete="off"
        class="w-full"
        @update:model-value="debouncedSearch"
        @focus="showAc = acItems.length > 0"
        @keydown.escape="showAc = false"
        @blur="hideAcSoon"
      />
      <ul
        v-if="showAc"
        class="glass-solid absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-[var(--radius-lg)] border border-(--color-border-strong) py-1 shadow-[var(--shadow-elev-3)]"
      >
        <li
          v-for="name in acItems"
          :key="name"
        >
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-(--color-text-mid) transition-colors hover:bg-(--color-surface-2) hover:text-(--color-text-high)"
            @mousedown.prevent="pickSuggestion(name)"
          >
            <UIcon
              name="i-lucide-search"
              class="h-3.5 w-3.5 shrink-0 text-(--color-text-muted)"
            />
            {{ name }}
          </button>
        </li>
      </ul>
    </div>

    <!-- Color pips: real mana symbols. Selected = full pip + accent ring + glow;
         unselected = dimmed & desaturated (still readable by colour). Hover lifts
         and lights up in the pip's own colour. -->
    <div class="mb-3 flex items-center gap-2">
      <span class="font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">{{ t('build.colors') }}</span>
      <div class="flex gap-1.5">
        <button
          v-for="pip in WUBRG"
          :key="pip"
          type="button"
          class="mana-toggle"
          :class="{ 'is-active': filters.colors.includes(pip) }"
          :style="{ '--pip': colorVar(pip) }"
          :aria-pressed="filters.colors.includes(pip)"
          :aria-label="`${colorCode(pip, isFr)} — ${colorName(pip, isFr)}`"
          :title="colorName(pip, isFr)"
          @click="toggleColor(pip, $event)"
        >
          <ManaSymbol :sym="pip" :size="22" />
        </button>
      </div>
    </div>

    <!-- Themes -->
    <div class="mb-3 flex flex-wrap gap-1.5">
      <button
        v-for="theme in SEARCH_THEMES"
        :key="theme.key"
        type="button"
        class="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-all hover:-translate-y-px"
        :class="filters.themes.includes(theme.key)
          ? 'accent-border-c accent-soft-bg text-(--accent-text)'
          : 'border-(--color-border-strong) text-(--color-text-mid) hover:border-(--accent-border) hover:bg-(--color-surface-2) hover:text-(--color-text-high)'"
        @click="toggleTheme(theme.key)"
      >
        <UIcon :name="theme.icon" class="h-3.5 w-3.5" />
        {{ t(theme.labelKey) }}
      </button>
    </div>

    <!-- EDHREC suggestions + commanders-only -->
    <div class="mb-3 flex flex-wrap gap-2">
      <button
        v-if="commanderName"
        type="button"
        class="flex items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all"
        :class="suggestMode
          ? 'accent-border-c accent-soft-bg text-(--accent-text)'
          : 'border-(--accent-border) text-(--accent-text) hover:bg-(--accent-soft)'"
        @click="showSuggestions"
      >
        <UIcon name="i-lucide-wand-sparkles" class="h-3.5 w-3.5" />
        {{ t('build.suggestions') }}
      </button>
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all"
        :class="filters.commanderOnly
          ? 'accent-border-c accent-soft-bg text-(--accent-text)'
          : 'border-(--color-border-strong) text-(--color-text-mid) hover:border-(--accent-border) hover:text-(--accent-text)'"
        :aria-pressed="filters.commanderOnly"
        @click="toggleCommanderOnly"
      >
        <UIcon name="i-lucide-crown" class="h-3.5 w-3.5" />
        {{ t('build.commanderOnly') }}
      </button>
    </div>

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

    <div class="mb-3 flex items-center gap-3">
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

    <!-- Budget filter: max € per card -->
    <div class="mb-3 flex items-center gap-3">
      <label class="font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
        {{ t('build.maxPrice') }}
      </label>
      <input
        v-model.number="maxPriceModel"
        type="range"
        min="0"
        max="50"
        step="1"
        class="flex-1 accent-(--accent)"
        :aria-label="t('build.maxPrice')"
      >
      <span class="w-10 text-center font-mono text-sm text-(--color-text-high)">
        {{ filters.maxPrice != null ? `${filters.maxPrice}€` : '∞' }}
      </span>
    </div>

    <!-- Sort order -->
    <div class="mb-4 flex items-center gap-2">
      <label class="font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
        {{ t('build.sortBy') }}
      </label>
      <USelect
        v-model="sortModel"
        size="xs"
        :items="SORT_OPTIONS.map(o => ({ label: t(o.key), value: o.value }))"
        class="flex-1"
      />
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
          v-tilt="{ max: 12, scale: 1.06 }"
          class="group relative overflow-hidden rounded-[var(--radius-md)]"
        >
          <button type="button" class="block w-full" :aria-label="cardName(card)" @click="emit('details', card)">
            <img
              v-if="cardImage(card)"
              :src="cardImage(card)!"
              :alt="cardName(card)"
              loading="lazy"
              class="block aspect-[63/88] w-full rounded-[var(--radius-md)] object-cover"
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

          <!-- add / remove overlay: toggles. In deck → green check, turns into a
               red "remove" on hover so a second click takes it out of the deck. -->
          <div class="pointer-events-none absolute inset-x-0 bottom-0 flex gap-1 p-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              class="add-toggle pointer-events-auto flex flex-1 items-center justify-center gap-1 rounded-[var(--radius-sm)] py-1 text-xs font-semibold text-(--color-bg-base)"
              :class="{ 'is-in-deck': inDeck.has(card.name.toLowerCase()) }"
              :aria-label="`${inDeck.has(card.name.toLowerCase()) ? t('build.removeFromDeck') : t('build.add')} — ${cardName(card)}`"
              @click="inDeck.has(card.name.toLowerCase()) ? emit('remove', card) : emit('add', card)"
            >
              <UIcon
                v-if="!inDeck.has(card.name.toLowerCase())"
                name="i-lucide-plus"
                class="h-3.5 w-3.5"
              />
              <template v-else>
                <UIcon name="i-lucide-check" class="check-icon h-3.5 w-3.5" />
                <UIcon name="i-lucide-x" class="remove-icon h-3.5 w-3.5" />
              </template>
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
          @click="loadMore()"
        >
          {{ t('build.loadMore') }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Add / remove toggle on a search result. Default = accent (add). In deck =
   green check; hovering the in-deck button turns it red and swaps to an ✕ so a
   click clearly removes the card. */
.add-toggle {
  background: var(--accent);
  transition: background var(--dur-fast) var(--ease-out);
}
.add-toggle.is-in-deck {
  background: var(--color-success);
}
.add-toggle .remove-icon {
  display: none;
}
@media (hover: hover) {
  .add-toggle.is-in-deck:hover {
    background: var(--color-error);
  }
  .add-toggle.is-in-deck:hover .check-icon {
    display: none;
  }
  .add-toggle.is-in-deck:hover .remove-icon {
    display: inline-block;
  }
}

/* WUBRG colour toggles built on real mana pips. --pip = the colour's CSS var. */
.mana-toggle {
  position: relative;
  overflow: hidden; /* clip the click ripple to the pip */
  display: grid;
  place-items: center;
  border-radius: 9999px;
  padding: 2px;
  transition:
    transform var(--dur) var(--ease-spring),
    box-shadow var(--dur) var(--ease-out),
    opacity var(--dur) var(--ease-out);
  /* Unselected: present but muted so the selected ones pop. The colour still
     reads through, just desaturated and dimmed. */
  opacity: 0.5;
  filter: saturate(0.55);
}
.mana-toggle:hover {
  transform: translateY(-2px) scale(1.15);
  opacity: 1;
  filter: none;
  box-shadow:
    0 0 0 2px rgba(0, 0, 0, 0.15),
    0 8px 18px -4px var(--pip);
}
.mana-toggle:active {
  transform: scale(0.92); /* satisfying press */
  transition-duration: 0.06s;
}
.mana-toggle:focus-visible {
  outline: none;
  opacity: 1;
  filter: none;
  box-shadow:
    0 0 0 2px var(--color-bg-base),
    0 0 0 4px var(--pip);
}
.mana-toggle.is-active {
  opacity: 1;
  filter: none;
  /* Ring in the pip's own colour + a glow that gently breathes. */
  animation:
    pip-pop 0.42s var(--ease-spring),
    pip-pulse 2.4s ease-in-out 0.42s infinite;
  box-shadow:
    0 0 0 2px var(--color-bg-base),
    0 0 0 4px var(--pip),
    0 0 14px -3px var(--pip);
}
.mana-toggle.is-active:hover {
  transform: translateY(-2px) scale(1.15);
}

/* Pop in with a spring overshoot the moment a colour becomes selected. */
@keyframes pip-pop {
  0% {
    transform: scale(0.8);
  }
  55% {
    transform: scale(1.22);
  }
  100% {
    transform: scale(1);
  }
}
/* Slow breathing halo while selected, in the pip's own colour. */
@keyframes pip-pulse {
  0%,
  100% {
    box-shadow:
      0 0 0 2px var(--color-bg-base),
      0 0 0 4px var(--pip),
      0 0 12px -4px var(--pip);
  }
  50% {
    box-shadow:
      0 0 0 2px var(--color-bg-base),
      0 0 0 4px var(--pip),
      0 0 22px 0 var(--pip);
  }
}

/* Click ripple (spawned in JS), bursting from the click point in pip colour. */
.mana-toggle :deep(.mana-ripple) {
  position: absolute;
  border-radius: 9999px;
  background: radial-gradient(circle, var(--pip) 0%, transparent 70%);
  opacity: 0.6;
  transform: scale(0);
  pointer-events: none;
  animation: mana-ripple 0.5s var(--ease-out) forwards;
}
@keyframes mana-ripple {
  to {
    transform: scale(1);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mana-toggle,
  .mana-toggle:hover,
  .mana-toggle:active,
  .mana-toggle.is-active,
  .mana-toggle.is-active:hover {
    transition:
      box-shadow var(--dur) var(--ease-out),
      opacity var(--dur) var(--ease-out);
    transform: none;
    animation: none;
  }
}
</style>
