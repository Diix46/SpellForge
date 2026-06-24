<script setup lang="ts">
import type { ManaCurve, PriceSummary } from '~/composables/useDeckAnalysis'
import type { ValidationIssue } from '~/composables/useDeckBuilder'
import type { DeckEntry } from '~/composables/useDecklist'
import { computed, ref } from 'vue'
import { useCardPreview } from '~/composables/useCardPreview'
import { useDeckListDropZone } from '~/composables/useDeckListDropZone'
import { useLocale } from '~/composables/useLocale'
import { useManaIdentity } from '~/composables/useManaIdentity'
import { cardKey, WUBRG } from '~/composables/useMtg'

const props = defineProps<{
  entries: DeckEntry[]
  total: number
  commanderName: string
  validation: ValidationIssue[]
  /** name(lower) → simple category for grouping (creature/land/…); optional. */
  categoryByName?: Map<string, string>
  /** name(lower) → color identity letters (for the colour distribution). */
  colorByName?: Map<string, string[]>
  /** name(lower) → localized display name (FR printed name when resolved). */
  displayNameByName?: Map<string, string>
  /** name(lower) → { thumb, image, manaCost } for enriched rows + hover preview. */
  cardMetaByName?: Map<string, { thumb: string | null, image: string | null, manaCost: string }>
  identityLocked: boolean
  curve?: ManaCurve
  price?: PriceSummary
  /** Resolved commander image (when available) for the feature card. */
  commanderImage?: string | null
  /** Localized commander type line for the feature card. */
  commanderType?: string
  /** Commander colour identity (WUBRG letters) for the feature card pips. */
  commanderColors?: string[]
  /** Commander's English (raw decklist) name — used to dedupe it out of the
   *  grouped list, which is keyed by raw entry names (commanderName is localized). */
  commanderRawName?: string
  /** True while card images/prices are still being resolved in the background —
   *  drives shimmer placeholders on the not-yet-ready thumbnails + pips. */
  resolving?: boolean
}>()

const emit = defineEmits<{
  setQty: [name: string, qty: number]
  remove: [name: string]
  setCommander: [name: string]
  toggleLock: []
  details: [name: string]
  showCommander: []
  /** A search card was dropped onto the deck → add it. */
  dropAdd: [name: string]
}>()

// Drop zone: dragging a SEARCH card here adds it. Highlight only while a search
// card is in flight (not when dragging deck rows out).
const { dropActive, onDragOver, onDragLeave, onDrop } = useDeckListDropZone(name => emit('dropAdd', name))

// Show the feature card only once the commander is actually known (named).
const hasCommander = computed(() => !!props.commanderName.trim())

// Analytics (distribution + curve) are collapsed by default so the card list —
// the working surface — keeps the height. A glance summary (avg CMC, price)
// stays visible on the toggle even when folded.
const statsOpen = ref(false)

// Localized display name for the commander feature card, falling back to its
// raw (English) name.
function displayNameOf(name: string): string {
  return props.displayNameByName?.get(cardKey(name)) || name
}

// Shared hover preview: a BIG floating card (geometry in useCardPreview). The
// commander's image comes from a prop (the grouped rows own their own preview).
const { preview, show: showPreviewSrc, hide: hidePreview } = useCardPreview()
function showCommanderPreview(e: MouseEvent) {
  showPreviewSrc(props.commanderImage, e)
}

const { t, isFr } = useLocale()
const { colorVar, colorCode } = useManaIdentity()

// Colour distribution: count cards (×qty) contributing to each WUBRG colour,
// plus colourless. A multicolour card counts toward each of its colours.
const distribution = computed(() => {
  const counts: Record<string, number> = { w: 0, u: 0, b: 0, r: 0, g: 0, c: 0 }
  for (const e of props.entries) {
    const id = props.colorByName?.get(cardKey(e.name))
    if (!id || id.length === 0) {
      counts.c = (counts.c ?? 0) + e.quantity
    }
    else {
      for (const c of id) {
        const k = c.toLowerCase()
        counts[k] = (counts[k] ?? 0) + e.quantity
      }
    }
  }
  const max = Math.max(1, ...Object.values(counts))
  return { counts, max }
})
const hasDistribution = computed(() => !!props.colorByName?.size)

function barCount(c: string): number {
  return distribution.value.counts[c] ?? 0
}

const errors = computed(() => props.validation.filter(v => v.level === 'error'))
const warnings = computed(() => props.validation.filter(v => v.level === 'warning'))
const isValid = computed(() => props.validation.length === 0)

function issueText(issue: ValidationIssue): string {
  return issue.value != null ? `${issue.value} ${t(issue.key)}` : t(issue.key)
}
</script>

<template>
  <div
    class="glass-solid relative flex h-full flex-col rounded-[var(--radius-xl)] p-4"
    :class="{ 'dnd-drop-active': dropActive }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Drop-to-add hint (only while a search card is dragged over) -->
    <div v-if="dropActive" class="dnd-hint">
      <UIcon name="i-lucide-plus" class="h-5 w-5" />
      {{ t('build.dropToAdd') }}
    </div>

    <!-- Header: title + counter -->
    <div class="mb-3 flex items-center justify-between">
      <h3 class="font-mono text-[11px] uppercase tracking-[2px] text-(--color-text-muted)">
        {{ t('build.deckTitle') }}
      </h3>
      <span
        class="rounded-full px-2.5 py-0.5 font-mono text-sm font-semibold"
        :class="total === 100 ? 'text-(--color-success)' : 'text-(--accent-text)'"
      >
        {{ total }} / 100
      </span>
    </div>

    <!-- Commander feature: same treatment as the Preview tab, so the commander
         is immediately identifiable instead of lost among the créatures. -->
    <button
      v-if="hasCommander"
      type="button"
      class="group/cmd accent-border-c mb-2 flex w-full shrink-0 items-center gap-2.5 rounded-[var(--radius-lg)] accent-soft-bg p-2 text-left ring-1 transition-colors hover:bg-[rgba(var(--accent-rgb),0.18)]"
      @click="emit('showCommander')"
      @mouseenter="showCommanderPreview"
      @mouseleave="hidePreview"
    >
      <div
        v-if="commanderImage"
        class="h-12 w-[34px] shrink-0 overflow-hidden rounded-[var(--radius-sm)] ring-1 ring-(--accent-border) transition-all group-hover/cmd:ring-2"
        :style="{ boxShadow: 'var(--accent-glow-soft)' }"
      >
        <img
          :src="commanderImage"
          :alt="displayNameOf(commanderName)"
          class="h-full w-full object-cover object-top transition-[filter] group-hover/cmd:brightness-110"
        >
      </div>
      <div
        v-else
        class="grid h-12 w-[34px] shrink-0 place-items-center rounded-[var(--radius-sm)] bg-(--color-surface-2) ring-1 ring-(--accent-border)"
      >
        <UIcon name="i-lucide-crown" class="h-4 w-4 text-(--accent-text)" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="mb-0.5 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[2px] text-(--accent-text)">
          <UIcon name="i-lucide-crown" class="h-3 w-3" />
          {{ t('commander.label') }}
        </div>
        <div class="truncate text-sm font-semibold text-(--color-text-high)">
          {{ displayNameOf(commanderName) }}
        </div>
        <div v-if="commanderType" class="truncate text-xs text-(--color-text-muted)">
          {{ commanderType }}
        </div>
        <div v-if="commanderColors && commanderColors.length" class="mt-1 flex items-center gap-1">
          <span
            v-for="c in commanderColors"
            :key="c"
            class="h-2.5 w-2.5 rounded-full ring-1 ring-white/10"
            :style="{ background: colorVar(c as 'w') }"
          />
        </div>
      </div>
    </button>

    <!-- Identity lock toggle -->
    <button
      type="button"
      class="mb-3 flex items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11px] transition-colors"
      :class="identityLocked
        ? 'accent-border-c accent-soft-bg text-(--accent-text)'
        : 'border-(--color-border-subtle) text-(--color-text-muted) hover:border-(--color-border-strong)'"
      @click="emit('toggleLock')"
    >
      <UIcon :name="identityLocked ? 'i-lucide-lock' : 'i-lucide-lock-open'" class="h-3.5 w-3.5" />
      {{ identityLocked ? t('build.lockOn') : t('build.lockOff') }}
    </button>

    <!-- Stats strip: distribution + curve + price laid out side by side so the
         analytics stay glanceable without stealing the height the card list
         needs. Collapsible — folded by default keeps the list the hero. -->
    <div v-if="entries.length" class="mb-3 shrink-0">
      <button
        type="button"
        class="mb-2 flex w-full items-center gap-2 text-left font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted) transition-colors hover:text-(--color-text-high)"
        @click="statsOpen = !statsOpen"
      >
        <UIcon :name="statsOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="h-3.5 w-3.5" />
        {{ t('build.stats') }}
        <span class="ml-auto flex items-center gap-3 normal-case tracking-normal">
          <span v-if="curve && curve.spells > 0">{{ t('build.avgCmc') }} <b class="text-(--color-text-mid)">{{ curve.avg.toFixed(1) }}</b></span>
          <span v-if="price && price.total > 0" class="text-(--accent-text)">{{ price.total.toFixed(0) }} €</span>
        </span>
      </button>

      <div v-if="statsOpen" class="grid grid-cols-2 gap-3">
        <!-- Colour distribution -->
        <div v-if="hasDistribution">
          <div class="mb-1 font-mono text-[9px] uppercase tracking-wider text-(--color-text-disabled)">
            {{ t('build.distribution') }}
          </div>
          <div class="flex items-end gap-1">
            <div
              v-for="c in [...WUBRG, 'c']"
              :key="c"
              class="flex flex-1 flex-col items-center gap-0.5"
            >
              <div class="flex h-8 w-full items-end overflow-hidden rounded bg-(--color-surface-2)/50">
                <div
                  class="w-full rounded transition-all"
                  :style="{
                    height: `${(barCount(c) / distribution.max) * 100}%`,
                    background: c === 'c' ? 'var(--color-ink-500)' : colorVar(c as 'w'),
                    minHeight: barCount(c) ? '3px' : '0',
                  }"
                />
              </div>
              <span class="font-mono text-[8px] uppercase text-(--color-text-muted)">{{ c === 'c' ? '◇' : colorCode(c, isFr) }}</span>
            </div>
          </div>
        </div>

        <!-- Mana curve (non-land spells) -->
        <div v-if="curve && curve.spells > 0">
          <div class="mb-1 font-mono text-[9px] uppercase tracking-wider text-(--color-text-disabled)">
            {{ t('build.curve') }}
          </div>
          <div class="flex items-end gap-1">
            <div
              v-for="(n, i) in curve.buckets"
              :key="i"
              class="flex flex-1 flex-col items-center gap-0.5"
            >
              <div class="flex h-8 w-full items-end overflow-hidden rounded bg-(--color-surface-2)/50">
                <div
                  class="w-full rounded transition-all"
                  :style="{
                    height: `${(n / curve.max) * 100}%`,
                    background: 'var(--accent)',
                    minHeight: n ? '3px' : '0',
                  }"
                />
              </div>
              <span class="font-mono text-[8px] text-(--color-text-muted)">{{ i === 7 ? '7+' : i }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Validation (thin) -->
    <div
      v-if="entries.length"
      class="mb-3 shrink-0 rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs"
      :class="isValid ? 'bg-(--color-success)/10 text-(--color-success)' : 'bg-(--color-surface-2)/60'"
    >
      <div v-if="isValid" class="flex items-center gap-1.5 font-medium">
        <UIcon name="i-lucide-check-circle-2" class="h-3.5 w-3.5" />
        {{ t('valid.ok') }}
      </div>
      <template v-else>
        <div
          v-for="(issue, i) in [...errors, ...warnings]"
          :key="i"
          class="flex items-center gap-1.5"
          :class="issue.level === 'error' ? 'text-(--color-error)' : 'text-(--color-warning)'"
        >
          <UIcon :name="issue.level === 'error' ? 'i-lucide-x-circle' : 'i-lucide-alert-triangle'" class="h-3.5 w-3.5 shrink-0" />
          <span class="truncate">{{ issueText(issue) }}</span>
        </div>
      </template>
    </div>

    <!-- Empty -->
    <p v-if="!entries.length" class="flex-1 py-10 text-center text-sm text-(--color-text-muted)">
      {{ t('build.empty') }}
    </p>

    <!-- Grouped list — laid out as one column per category so the whole deck
         reads at once (like a real deck plan) instead of one long scroll. The
         container only scrolls vertically if the tallest category overflows. -->
    <BuilderDeckGroupedList
      v-else
      :entries="entries"
      :commander-name="commanderName"
      :commander-raw-name="commanderRawName"
      :category-by-name="categoryByName"
      :display-name-by-name="displayNameByName"
      :card-meta-by-name="cardMetaByName"
      :resolving="resolving"
      @set-qty="(name, qty) => emit('setQty', name, qty)"
      @remove="name => emit('remove', name)"
      @set-commander="name => emit('setCommander', name)"
      @details="name => emit('details', name)"
    />

    <!-- Shared hover preview: a big floating card that pops up beside the
         commander card (teleported to body so the scroll container can't clip it). -->
    <Teleport to="body">
      <Transition name="cardpop">
        <img
          v-if="preview"
          :src="preview.src"
          alt=""
          class="card-preview pointer-events-none fixed z-[var(--z-tooltip)] rounded-[var(--radius-xl)] ring-1 ring-(--accent-border)"
          :style="{ left: `${preview.x}px`, top: `${preview.y}px`, width: `${preview.w}px`, height: `${preview.h}px` }"
        >
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* ---- Drag & drop ---- */
/* The panel becomes a drop target when a search card is dragged here (to add). */
.dnd-drop-active {
  outline: 2px dashed var(--accent);
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
  background: color-mix(in srgb, var(--accent) 14%, var(--color-bg-base) 70%);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  color: var(--accent-text);
  font-size: 13px;
  font-weight: 600;
  pointer-events: none;
}
</style>
