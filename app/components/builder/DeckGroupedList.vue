<script setup lang="ts">
import type { DeckEntry } from '~/composables/useDecklist'
import { computed } from 'vue'
import { useCardDnd } from '~/composables/useCardDnd'
import { useCardPreview } from '~/composables/useCardPreview'
import { useLocale } from '~/composables/useLocale'
import { cardKey, CATEGORY_ORDER, categoryLabelKey } from '~/composables/useMtg'

const props = defineProps<{
  entries: DeckEntry[]
  commanderName: string
  /** Commander's English (raw decklist) name — used to dedupe it out of the
   *  grouped list, which is keyed by raw entry names (commanderName is localized). */
  commanderRawName?: string
  /** name(lower) → simple category for grouping (creature/land/…); optional. */
  categoryByName?: Map<string, string>
  /** name(lower) → localized display name (FR printed name when resolved). */
  displayNameByName?: Map<string, string>
  /** name(lower) → { thumb, image, manaCost } for enriched rows + hover preview. */
  cardMetaByName?: Map<string, { thumb: string | null, image: string | null, manaCost: string }>
  /** True while card images/prices are still being resolved in the background —
   *  drives shimmer placeholders on the not-yet-ready thumbnails + pips. */
  resolving?: boolean
}>()

const emit = defineEmits<{
  setQty: [name: string, qty: number]
  remove: [name: string]
  setCommander: [name: string]
  details: [name: string]
}>()

const { startDrag, endDrag } = useCardDnd()

// Localized display name for an entry, falling back to its raw (English) name.
function displayNameOf(name: string): string {
  return props.displayNameByName?.get(cardKey(name)) || name
}
function metaOf(name: string) {
  return props.cardMetaByName?.get(cardKey(name))
}
// Mana cost → array of symbol tokens (without braces) for the row pips.
function manaSymbols(name: string): string[] {
  const cost = metaOf(name)?.manaCost ?? ''
  return (cost.match(/\{[^}]+\}/g) ?? []).map(s => s.replace(/[{}]/g, ''))
}

// Shared hover preview: a BIG floating card (geometry in useCardPreview). Rows
// resolve their image from cardMetaByName.
const { preview, show: showPreviewSrc, hide: hidePreview } = useCardPreview()
function showPreview(name: string, e: MouseEvent) {
  showPreviewSrc(metaOf(name)?.image, e)
}

const { t } = useLocale()

function categoryOf(entry: DeckEntry): string {
  return props.categoryByName?.get(cardKey(entry.name)) ?? 'other'
}

const groups = computed(() => {
  // Entries are keyed by raw (English) names; match the commander on its raw name
  // (commanderName is localized and wouldn't match). Fall back to commanderName.
  const cmdr = cardKey(props.commanderRawName || props.commanderName)
  const map = new Map<string, DeckEntry[]>()
  for (const e of props.entries) {
    // The commander is shown in its own feature card above — skip it here so it
    // isn't listed twice.
    if (cmdr && cardKey(e.name) === cmdr)
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
</script>

<template>
  <!-- Grouped list — laid out as one column per category so the whole deck
       reads at once (like a real deck plan) instead of one long scroll. The
       container only scrolls vertically if the tallest category overflows. -->
  <div class="deck-cols -mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
    <div class="deck-cols-inner">
      <div v-for="group in groups" :key="group.key" class="deck-group">
        <div class="mb-1 flex items-center justify-between border-b border-(--color-border-subtle) pb-1">
          <h4 class="font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
            {{ group.label }}
          </h4>
          <span class="font-mono text-[10px] text-(--color-text-muted)">{{ group.count }}</span>
        </div>

        <div
          v-for="entry in group.cards"
          :key="entry.name"
          role="button"
          tabindex="0"
          draggable="true"
          class="dnd-row group/row relative flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 transition-colors hover:bg-(--color-surface-2)/60 focus-visible:outline-2 focus-visible:outline-(--accent-text)"
          @dragstart="startDrag($event, { source: 'deck', name: entry.name }); hidePreview()"
          @dragend="endDrag"
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
              class="grid h-5 w-4 place-items-center rounded text-(--color-text-muted) opacity-0 transition-opacity hover:text-(--color-text-high) focus-visible:ring-2 focus-visible:ring-(--accent-border) group-hover/row:opacity-100"
              aria-label="-"
              @click.stop="emit('setQty', entry.name, entry.quantity - 1)"
            >
              <UIcon name="i-lucide-minus" class="h-3 w-3" />
            </button>
            <span class="w-4 text-center font-mono text-xs text-(--color-text-high)">{{ entry.quantity }}</span>
            <button
              type="button"
              class="grid h-5 w-4 place-items-center rounded text-(--color-text-muted) opacity-0 transition-opacity hover:text-(--color-text-high) focus-visible:ring-2 focus-visible:ring-(--accent-border) group-hover/row:opacity-100"
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
              class="grid h-5 w-5 place-items-center rounded bg-(--color-surface-3) text-(--color-text-muted) hover:text-(--accent-text) focus-visible:ring-2 focus-visible:ring-(--accent-border)"
              :title="t('build.setCommander')"
              @click.stop="emit('setCommander', entry.name)"
            >
              <UIcon name="i-lucide-crown" class="h-3 w-3" />
            </button>
            <button
              type="button"
              class="grid h-5 w-5 place-items-center rounded bg-(--color-surface-3) text-(--color-text-muted) hover:text-(--color-error) focus-visible:ring-2 focus-visible:ring-(--accent-border)"
              aria-label="remove"
              @click.stop="emit('remove', entry.name)"
            >
              <UIcon name="i-lucide-trash-2" class="h-3 w-3" />
            </button>
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
/* ---- Drag & drop ---- */
.dnd-row {
  cursor: grab;
}
.dnd-row:active {
  cursor: grabbing;
}

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
  column-width: 248px;
  column-gap: 18px;
}
.deck-group {
  break-inside: avoid;
  -webkit-column-break-inside: avoid;
  margin-bottom: 12px;
}
</style>
