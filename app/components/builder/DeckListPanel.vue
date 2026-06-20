<script setup lang="ts">
import type { ManaCurve, PriceSummary } from '~/composables/useDeckAnalysis'
import type { ValidationIssue } from '~/composables/useDeckBuilder'
import type { DeckEntry } from '~/composables/useDecklist'
import { computed, ref } from 'vue'
import { useLocale } from '~/composables/useLocale'
import { useManaIdentity } from '~/composables/useManaIdentity'
import { CATEGORY_ORDER, categoryLabelKey, WUBRG } from '~/composables/useMtg'

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
}>()

// Show the feature card only once the commander is actually known (named).
const hasCommander = computed(() => !!props.commanderName.trim())

// Localized display name for an entry, falling back to its raw (English) name.
function displayNameOf(name: string): string {
  return props.displayNameByName?.get(name.trim().toLowerCase()) || name
}
function metaOf(name: string) {
  return props.cardMetaByName?.get(name.trim().toLowerCase())
}
// Mana cost → array of symbol tokens (without braces) for the row pips.
function manaSymbols(name: string): string[] {
  const cost = metaOf(name)?.manaCost ?? ''
  return (cost.match(/\{[^}]+\}/g) ?? []).map(s => s.replace(/[{}]/g, ''))
}

// Shared hover preview (fixed-positioned so it escapes the scroll container).
const preview = ref<{ src: string, x: number, y: number } | null>(null)
function showPreview(name: string, e: MouseEvent) {
  const img = metaOf(name)?.image
  if (!img)
    return
  const row = (e.currentTarget as HTMLElement).getBoundingClientRect()
  // Place to the LEFT of the panel row; clamp vertically into the viewport.
  const w = 240
  const h = w * (88 / 63)
  const y = Math.min(Math.max(8, row.top + row.height / 2 - h / 2), window.innerHeight - h - 8)
  preview.value = { src: img, x: row.left - w - 12, y }
}
function hidePreview() {
  preview.value = null
}

const { t, isFr } = useLocale()
const { colorVar, colorCode } = useManaIdentity()

// Colour distribution: count cards (×qty) contributing to each WUBRG colour,
// plus colourless. A multicolour card counts toward each of its colours.
const distribution = computed(() => {
  const counts: Record<string, number> = { w: 0, u: 0, b: 0, r: 0, g: 0, c: 0 }
  for (const e of props.entries) {
    const id = props.colorByName?.get(e.name.trim().toLowerCase())
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

function categoryOf(entry: DeckEntry): string {
  return props.categoryByName?.get(entry.name.trim().toLowerCase()) ?? 'other'
}

const groups = computed(() => {
  // Entries are keyed by raw (English) names; match the commander on its raw name
  // (commanderName is localized and wouldn't match). Fall back to commanderName.
  const cmdr = (props.commanderRawName || props.commanderName).trim().toLowerCase()
  const map = new Map<string, DeckEntry[]>()
  for (const e of props.entries) {
    // The commander is shown in its own feature card above — skip it here so it
    // isn't listed twice.
    if (cmdr && e.name.trim().toLowerCase() === cmdr)
      continue
    const cat = categoryOf(e)
    if (!map.has(cat))
      map.set(cat, [])
    map.get(cat)!.push(e)
  }
  return CATEGORY_ORDER
    .filter(c => map.has(c))
    .map(c => ({
      key: c,
      label: t(categoryLabelKey(c)),
      cards: [...map.get(c)!].sort((a, b) => a.name.localeCompare(b.name)),
      count: map.get(c)!.reduce((s, e) => s + e.quantity, 0),
    }))
})

const errors = computed(() => props.validation.filter(v => v.level === 'error'))
const warnings = computed(() => props.validation.filter(v => v.level === 'warning'))
const isValid = computed(() => props.validation.length === 0)

function issueText(issue: ValidationIssue): string {
  return issue.value != null ? `${issue.value} ${t(issue.key)}` : t(issue.key)
}
</script>

<template>
  <div class="glass-solid flex h-full flex-col rounded-[var(--radius-xl)] p-4">
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
      class="group/cmd accent-border-c mb-3 flex w-full items-center gap-3 rounded-[var(--radius-lg)] accent-soft-bg p-2.5 text-left ring-1 transition-colors hover:bg-[rgba(var(--accent-rgb),0.18)]"
      @click="emit('showCommander')"
    >
      <div
        v-if="commanderImage"
        class="h-16 w-[46px] shrink-0 overflow-hidden rounded-[var(--radius-sm)] ring-1 ring-(--accent-border)"
        :style="{ boxShadow: 'var(--accent-glow-soft)' }"
      >
        <img
          :src="commanderImage"
          :alt="displayNameOf(commanderName)"
          class="h-full w-full object-cover object-top transition-transform duration-300 ease-out group-hover/cmd:scale-[1.18] motion-reduce:transition-none motion-reduce:group-hover/cmd:scale-100"
        >
      </div>
      <div
        v-else
        class="grid h-16 w-[46px] shrink-0 place-items-center rounded-[var(--radius-sm)] bg-(--color-surface-2) ring-1 ring-(--accent-border)"
      >
        <UIcon name="i-lucide-crown" class="h-5 w-5 text-(--accent-text)" />
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

    <!-- Colour distribution -->
    <div v-if="hasDistribution && entries.length" class="mb-3">
      <div class="mb-1 font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
        {{ t('build.distribution') }}
      </div>
      <div class="flex items-end gap-1">
        <div
          v-for="c in [...WUBRG, 'c']"
          :key="c"
          class="flex flex-1 flex-col items-center gap-1"
        >
          <span class="font-mono text-[10px] text-(--color-text-muted)">{{ barCount(c) }}</span>
          <div class="flex h-12 w-full items-end overflow-hidden rounded bg-(--color-surface-2)/50">
            <div
              class="w-full rounded transition-all"
              :style="{
                height: `${(barCount(c) / distribution.max) * 100}%`,
                background: c === 'c' ? 'var(--color-ink-500)' : colorVar(c as 'w'),
                minHeight: barCount(c) ? '3px' : '0',
              }"
            />
          </div>
          <span class="font-mono text-[9px] uppercase text-(--color-text-muted)">{{ c === 'c' ? '◇' : colorCode(c, isFr) }}</span>
        </div>
      </div>
    </div>

    <!-- Mana curve (non-land spells) -->
    <div v-if="curve && curve.spells > 0" class="mb-3">
      <div class="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
        <span>{{ t('build.curve') }}</span>
        <span>{{ t('build.avgCmc') }} {{ curve.avg.toFixed(1) }}</span>
      </div>
      <div class="flex items-end gap-1">
        <div
          v-for="(n, i) in curve.buckets"
          :key="i"
          class="flex flex-1 flex-col items-center gap-1"
        >
          <span class="font-mono text-[10px] text-(--color-text-muted)">{{ n || '' }}</span>
          <div class="flex h-12 w-full items-end overflow-hidden rounded bg-(--color-surface-2)/50">
            <div
              class="w-full rounded transition-all"
              :style="{
                height: `${(n / curve.max) * 100}%`,
                background: 'var(--accent)',
                minHeight: n ? '3px' : '0',
              }"
            />
          </div>
          <span class="font-mono text-[9px] text-(--color-text-muted)">{{ i === 7 ? '7+' : i }}</span>
        </div>
      </div>
    </div>

    <!-- Total price -->
    <div
      v-if="price && price.total > 0"
      class="mb-3 flex items-center justify-between rounded-[var(--radius-md)] bg-(--color-surface-2)/50 px-3 py-2"
    >
      <span class="font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">{{ t('build.totalPrice') }}</span>
      <span class="font-mono text-sm font-semibold text-(--accent-text)">
        {{ price.total.toFixed(2) }} €
        <span v-if="price.missing" class="text-[10px] text-(--color-text-muted)">(+{{ price.missing }} ?)</span>
      </span>
    </div>

    <!-- Validation -->
    <div
      class="mb-3 rounded-[var(--radius-md)] p-2.5 text-xs"
      :class="isValid ? 'bg-(--color-success)/10 text-(--color-success)' : 'bg-(--color-surface-2)/60'"
    >
      <div v-if="isValid" class="flex items-center gap-1.5 font-medium">
        <UIcon name="i-lucide-check-circle-2" class="h-4 w-4" />
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

    <!-- Grouped list (scrollable) -->
    <div v-else class="-mr-2 flex-1 space-y-3 overflow-y-auto pr-2">
      <div v-for="group in groups" :key="group.key">
        <div class="mb-1 flex items-center justify-between border-b border-(--color-border-subtle) pb-1">
          <span class="font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
            {{ group.label }}
          </span>
          <span class="font-mono text-[10px] text-(--color-text-muted)">{{ group.count }}</span>
        </div>

        <div
          v-for="entry in group.cards"
          :key="entry.name"
          role="button"
          tabindex="0"
          class="group/row relative flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 transition-colors hover:bg-(--color-surface-2)/60 focus-visible:outline-2 focus-visible:outline-(--accent-text)"
          @mouseenter="showPreview(entry.name, $event)"
          @mouseleave="hidePreview"
          @click="emit('details', entry.name)"
          @keydown.enter.prevent="emit('details', entry.name)"
          @keydown.space.prevent="emit('details', entry.name)"
        >
          <!-- thumbnail: zooms on row hover; shimmers while the card resolves -->
          <div class="h-9 w-7 shrink-0 overflow-hidden rounded-[3px] bg-(--color-surface-2) ring-1 ring-(--color-border-subtle)">
            <img
              v-if="metaOf(entry.name)?.thumb"
              :src="metaOf(entry.name)!.thumb!"
              :alt="displayNameOf(entry.name)"
              loading="lazy"
              class="h-full w-full object-cover transition-transform duration-300 ease-out group-hover/row:scale-[1.18] motion-reduce:transition-none motion-reduce:group-hover/row:scale-100"
            >
            <div v-else-if="resolving" class="skeleton h-full w-full" />
          </div>

          <!-- qty (compact, becomes steppers on hover) -->
          <div class="flex shrink-0 items-center">
            <button
              type="button"
              class="grid h-5 w-4 place-items-center rounded text-(--color-text-muted) opacity-0 transition-opacity hover:text-(--color-text-high) group-hover/row:opacity-100"
              aria-label="-"
              @click.stop="emit('setQty', entry.name, entry.quantity - 1)"
            >
              <UIcon name="i-lucide-minus" class="h-3 w-3" />
            </button>
            <span class="w-4 text-center font-mono text-xs text-(--color-text-high)">{{ entry.quantity }}</span>
            <button
              type="button"
              class="grid h-5 w-4 place-items-center rounded text-(--color-text-muted) opacity-0 transition-opacity hover:text-(--color-text-high) group-hover/row:opacity-100"
              aria-label="+"
              @click.stop="emit('setQty', entry.name, entry.quantity + 1)"
            >
              <UIcon name="i-lucide-plus" class="h-3 w-3" />
            </button>
          </div>

          <span class="min-w-0 flex-1 truncate text-sm text-(--color-text-high)">{{ displayNameOf(entry.name) }}</span>

          <!-- mana cost pips (shimmer placeholders while the card resolves) -->
          <span
            v-if="manaSymbols(entry.name).length"
            class="flex shrink-0 items-center gap-px transition-opacity group-hover/row:opacity-0"
          >
            <ManaSymbol
              v-for="(s, i) in manaSymbols(entry.name)"
              :key="i"
              :sym="s"
              :size="13"
            />
          </span>
          <span
            v-else-if="resolving"
            class="flex shrink-0 items-center gap-px transition-opacity group-hover/row:opacity-0"
            aria-hidden="true"
          >
            <span class="skeleton h-[13px] w-[13px] rounded-full" />
            <span class="skeleton h-[13px] w-[13px] rounded-full" />
          </span>

          <!-- actions (hover only, overlay the pips). A left-fading solid backing
               masks the truncated card name beneath so the buttons never appear to
               sit on top of text (no see-through "empiètement"). -->
          <div class="absolute inset-y-0 right-0 flex items-center gap-0.5 rounded-r-[var(--radius-sm)] pl-6 pr-1.5 opacity-0 transition-opacity bg-gradient-to-l from-(--color-surface-2) from-65% to-transparent group-hover/row:opacity-100">
            <button
              type="button"
              class="grid h-5 w-5 place-items-center rounded bg-(--color-surface-3) text-(--color-text-muted) hover:text-(--accent-text)"
              :title="t('build.setCommander')"
              @click.stop="emit('setCommander', entry.name)"
            >
              <UIcon name="i-lucide-crown" class="h-3 w-3" />
            </button>
            <button
              type="button"
              class="grid h-5 w-5 place-items-center rounded bg-(--color-surface-3) text-(--color-text-muted) hover:text-(--color-error)"
              aria-label="remove"
              @click.stop="emit('remove', entry.name)"
            >
              <UIcon name="i-lucide-trash-2" class="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Shared hover preview (teleported so the scroll container can't clip it). -->
    <Teleport to="body">
      <img
        v-if="preview"
        :src="preview.src"
        alt=""
        class="pointer-events-none fixed z-[var(--z-tooltip)] w-60 rounded-[var(--radius-lg)] shadow-[var(--shadow-elev-3)] ring-1 ring-(--color-border-strong)"
        :style="{ left: `${preview.x}px`, top: `${preview.y}px` }"
      >
    </Teleport>
  </div>
</template>
