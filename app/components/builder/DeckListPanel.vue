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

// Analytics (distribution + curve) are collapsed by default so the card list —
// the working surface — keeps the height. A glance summary (avg CMC, price)
// stays visible on the toggle even when folded.
const statsOpen = ref(false)

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

// Shared hover preview: a BIG floating card, fixed-positioned so it escapes the
// scroll container. Size is height-driven (~70% of the viewport) so it's large
// and impressive, clamped to the room available on the left of the row.
const CARD_RATIO = 88 / 63
const preview = ref<{ src: string, x: number, y: number, w: number, h: number } | null>(null)
function positionPreview(src: string, anchor: HTMLElement) {
  const row = anchor.getBoundingClientRect()
  const gap = 16
  // Target a tall card; cap height to the viewport and width to the space left
  // of the panel (fall back to the right side if the left is too narrow).
  let h = Math.min(window.innerHeight * 0.7, 620)
  let w = h / CARD_RATIO
  const roomLeft = row.left - gap * 2
  const roomRight = window.innerWidth - row.right - gap * 2
  const room = Math.max(roomLeft, roomRight)
  if (w > room) {
    w = Math.max(200, room) // never go absurdly small
    h = w * CARD_RATIO
  }
  // Prefer the left side; flip right when the left doesn't fit.
  const x = roomLeft >= w ? row.left - w - gap : row.right + gap
  const y = Math.min(Math.max(8, row.top + row.height / 2 - h / 2), window.innerHeight - h - 8)
  preview.value = { src, x, y, w, h }
}
function showPreview(name: string, e: MouseEvent) {
  const img = metaOf(name)?.image
  if (img)
    positionPreview(img, e.currentTarget as HTMLElement)
}
function hidePreview() {
  preview.value = null
}
// The commander's image comes from a prop (not cardMetaByName); reuse the float.
function showCommanderPreview(e: MouseEvent) {
  if (props.commanderImage)
    positionPreview(props.commanderImage, e.currentTarget as HTMLElement)
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
    <div v-else class="deck-cols -mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
      <div class="deck-cols-inner">
        <div v-for="group in groups" :key="group.key" class="deck-group">
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
            <!-- thumbnail: brightens + accent ring on hover; the big card pops up as
               a floating preview (teleported, below) so it isn't clipped by scroll.
               Shimmers while the card resolves. -->
            <div class="h-9 w-7 shrink-0 overflow-hidden rounded-[3px] bg-(--color-surface-2) ring-1 ring-(--color-border-subtle) transition-all group-hover/row:ring-(--accent-border) group-hover/row:ring-2">
              <img
                v-if="metaOf(entry.name)?.thumb"
                :src="metaOf(entry.name)!.thumb!"
                :alt="displayNameOf(entry.name)"
                loading="lazy"
                class="h-full w-full object-cover transition-[filter] group-hover/row:brightness-110"
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
    </div>

    <!-- Shared hover preview: a big floating card that pops up beside the row
         (teleported to body so the scroll container can't clip it). -->
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
/* Category groups flow as a responsive grid: as many columns as the (now wide)
   panel allows, wrapping to new rows and scrolling VERTICALLY only on real
   overflow. Grid (not CSS multicol) so we never get a horizontal scrollbar. */
/* Category columns laid side by side (a real deck plan). The grid fits as many
   ~170px columns as the width allows, each category in its own column; tall
   categories make their column taller and the whole grid scrolls VERTICALLY
   only on genuine overflow. overflow-x is clipped so there's never a sideways
   bar — columns always share the available width. */
/* Outer = the scroll viewport (gets its height from the flex workspace and
   scrolls VERTICALLY only on real overflow). Inner = a balanced multi-column
   flow: cards fill the available width across columns and grow downward, so a
   tall category spreads across columns instead of forcing a sideways scroll. */
.deck-cols {
  overflow-x: hidden;
}
.deck-cols-inner {
  column-width: 176px;
  column-gap: 16px;
}
.deck-group {
  break-inside: avoid;
  -webkit-column-break-inside: avoid;
  margin-bottom: 12px;
}
</style>
