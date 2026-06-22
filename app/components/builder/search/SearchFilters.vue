<script setup lang="ts">
import type { CardTypeFilter, SearchFilters, SortOrder } from '~/composables/useCardSearch'
import type { ManaColor } from '~/composables/useMtg'
import { computed, ref } from 'vue'
import { SEARCH_THEMES } from '~/composables/useCardSearch'
import { useLocale } from '~/composables/useLocale'
import { useManaIdentity } from '~/composables/useManaIdentity'
import { WUBRG } from '~/composables/useMtg'

// All the search filter controls (text + autocomplete, colour pips, themes,
// EDHREC-suggest + commanders-only, type/subtype, CMC/price sliders, sort).
// Mutates the shared reactive `filters` object in place and emits `change` so
// the panel re-runs the search. Extracted from CardSearchPanel — the panel keeps
// the search engine + results; this owns the input surface.

const props = defineProps<{
  /** Commander color identity (drives the identity note); null = no constraint. */
  identity: ManaColor[] | null
  /** Commander name (localized) — when set, shows the EDHREC-suggest button. */
  commanderName?: string
  /** Whether EDHREC-suggest mode is currently active. */
  suggestMode: boolean
  /** Scryfall name autocomplete (owned by the panel's useCardSearch instance). */
  autocomplete: (text: string) => Promise<string[]>
}>()

const emit = defineEmits<{
  /** A filter changed → re-run the search. */
  change: []
  /** Free-text changed → debounced search + autocomplete refresh. */
  textInput: []
  /** Show EDHREC suggestions for the commander. */
  suggest: []
}>()

// Shared reactive filter state (two-way bound). Mutating nested fields of the
// model value is the idiomatic way to keep the parent's reactive object in sync
// without re-emitting the whole object on every keystroke.
const filters = defineModel<SearchFilters>('filters', { required: true })

const { t, isFr } = useLocale()
const { colorVar, colorName, colorCode } = useManaIdentity()

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
const SORT_OPTIONS: { value: SortOrder, key: string }[] = [
  { value: 'edhrec', key: 'sort.edhrec' },
  { value: 'eur', key: 'sort.price' },
  { value: 'name', key: 'sort.name' },
  { value: 'cmc', key: 'sort.cmc' },
]

const typeModel = computed({
  get: () => filters.value.type || 'any',
  set: (v: string) => {
    filters.value.type = (v === 'any' ? '' : v) as CardTypeFilter
    emit('change')
  },
})
const maxCmcModel = computed({
  get: () => filters.value.maxCmc ?? 0,
  set: (v: number) => {
    filters.value.maxCmc = v > 0 ? v : null
    emit('change')
  },
})
const maxPriceModel = computed({
  get: () => filters.value.maxPrice ?? 0,
  set: (v: number) => {
    filters.value.maxPrice = v > 0 ? v : null
    emit('change')
  },
})
const sortModel = computed({
  get: () => filters.value.order,
  set: (v: SortOrder) => {
    filters.value.order = v
    emit('change')
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
  const i = filters.value.colors.indexOf(c)
  if (i >= 0)
    filters.value.colors.splice(i, 1)
  else filters.value.colors.push(c)
  emit('change')
}
function toggleTheme(key: string) {
  const i = filters.value.themes.indexOf(key)
  if (i >= 0)
    filters.value.themes.splice(i, 1)
  else filters.value.themes.push(key)
  emit('change')
}
function toggleCommanderOnly() {
  filters.value.commanderOnly = !filters.value.commanderOnly
  emit('change')
}

// ---- Name autocomplete (Scryfall /autocomplete) ----
const acItems = ref<string[]>([])
const showAc = ref(false)
let acDebounce: ReturnType<typeof setTimeout> | null = null
let acSeq = 0
async function refreshAutocomplete(text: string) {
  const seq = ++acSeq
  const names = await props.autocomplete(text)
  if (seq !== acSeq)
    return // a newer keystroke superseded this lookup
  acItems.value = names.slice(0, 8)
  showAc.value = acItems.value.length > 0
}
function onTextInput() {
  emit('textInput')
  if (acDebounce)
    clearTimeout(acDebounce)
  acDebounce = setTimeout(refreshAutocomplete, 200, filters.value.text)
}
function pickSuggestion(name: string) {
  filters.value.text = name
  showAc.value = false
  acItems.value = []
  emit('change')
}
// Delay hiding on blur so a suggestion click (mousedown) still registers.
function hideAcSoon() {
  setTimeout(() => (showAc.value = false), 120)
}
</script>

<template>
  <div>
    <!-- Free text + name autocomplete -->
    <div class="relative mb-3">
      <UInput
        v-model="filters.text"
        name="card-search"
        :placeholder="t('build.searchPlaceholder')"
        icon="i-lucide-search"
        autocomplete="off"
        class="w-full"
        @update:model-value="onTextInput"
        @focus="showAc = acItems.length > 0"
        @keydown.escape="showAc = false"
        @blur="hideAcSoon"
      />
      <ul
        v-if="showAc"
        class="glass-solid absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-[var(--radius-lg)] border border-(--color-border-strong) py-1 shadow-[var(--shadow-elev-3)]"
      >
        <li v-for="name in acItems" :key="name">
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-(--color-text-mid) transition-colors hover:bg-(--color-surface-2) hover:text-(--color-text-high)"
            @mousedown.prevent="pickSuggestion(name)"
          >
            <UIcon name="i-lucide-search" class="h-3.5 w-3.5 shrink-0 text-(--color-text-muted)" />
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
        @click="emit('suggest')"
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
        @update:model-value="emit('textInput')"
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
  </div>
</template>

<style scoped>
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
