<script setup lang="ts">
import type { ResolvedCard } from '~/composables/useScryfall'
import { computed } from 'vue'
import { useLocale } from '~/composables/useLocale'
import { useSpotlight } from '~/composables/useSpotlight'

const props = defineProps<{
  card: ResolvedCard
  index?: number
  commander?: boolean
  /** Shows ‹ › to step through the card's printings in place. */
  cyclable?: boolean
  /** A printing just stepped to, shown until the deck re-resolves. */
  imageOverride?: string | null
}>()
const emit = defineEmits<{
  details: [card: ResolvedCard]
  cycle: [card: ResolvedCard, dir: 1 | -1]
  hover: [card: ResolvedCard | null]
}>()

const { t } = useLocale()
const { el: spotEl } = useSpotlight()

const delay = computed(() => `${Math.min((props.index ?? 0) * 22, 500)}ms`)
const image = computed(() => props.imageOverride || props.card.imageUrl || '')
// ← → on a focused tile step its printing (the ‹ › buttons stay out of the tab
// order: a 100-card deck would otherwise add 200 tab stops).
function onArrow(e: KeyboardEvent, dir: 1 | -1) {
  if (!props.cyclable || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
    return
  e.preventDefault()
  emit('cycle', props.card, dir)
}
// A printing picked by hand: the entry carries its `(SET) NUM`.
const pinned = computed(() => !!(props.card.entry.set && props.card.entry.collectorNumber))
</script>

<template>
  <div
    class="fade-up group/tile relative"
    :style="{ animationDelay: delay }"
    @mouseenter="emit('hover', card)"
    @mouseleave="emit('hover', null)"
  >
    <!-- Error / missing -->
    <div
      v-if="card.error || !card.imageUrl"
      class="flex aspect-[63/88] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-(--color-error)/40 bg-(--color-error)/10 p-2 text-center"
    >
      <UIcon
        name="i-lucide-image-off"
        class="mb-1 h-6 w-6 text-(--color-error)"
      />
      <p class="text-xs font-medium leading-tight text-(--color-error)">
        {{ card.entry.name }}
      </p>
      <p class="mt-1 text-[10px] leading-tight text-(--color-text-muted)">
        {{ t('card.notFound') }}
      </p>
    </div>

    <!-- Card -->
    <button
      v-else
      ref="spotEl"
      type="button"
      data-card-tile
      class="holo-sheen group relative block aspect-[63/88] w-full overflow-hidden rounded-[var(--radius-lg)] text-left transition-transform duration-200 hover:z-10 hover:scale-[1.04]"
      :class="commander ? 'ring-2 ring-(--accent-border)' : ''"
      :style="{ boxShadow: commander ? 'var(--accent-glow-soft), var(--shadow-elev-2)' : 'var(--shadow-elev-2)' }"
      @click="emit('details', card)"
      @keydown.left="onArrow($event, -1)"
      @keydown.right="onArrow($event, 1)"
    >
      <img
        :src="image"
        :alt="card.card?.name ?? card.entry.name"
        class="block h-full w-full rounded-[var(--radius-lg)] object-cover"
        loading="lazy"
      >

      <!-- reactive accent ring on hover -->
      <div
        class="pointer-events-none absolute inset-0 rounded-[var(--radius-lg)] opacity-0 ring-1 ring-(--accent-border) transition-opacity duration-200 group-hover:opacity-100"
        :style="{ boxShadow: 'var(--accent-glow-soft)' }"
      />

      <!-- commander crown -->
      <div
        v-if="commander"
        class="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-(--color-bg-base)"
        :style="{ background: 'var(--gradient-accent)' }"
      >
        <UIcon
          name="i-lucide-crown"
          class="h-3 w-3"
        />
        {{ t('commander.label') }}
      </div>

      <!-- qty -->
      <div
        v-if="card.entry.quantity > 1"
        class="absolute -left-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-(--color-bg-base) shadow-[var(--accent-glow-soft)]"
        :style="{ background: 'var(--accent)' }"
      >
        {{ card.entry.quantity }}
      </div>

      <!-- zoom hint on hover -->
      <div
        class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      >
        <span class="grid h-9 w-9 place-items-center rounded-full bg-black/60 backdrop-blur-sm">
          <UIcon
            name="i-lucide-search"
            class="h-4 w-4 text-white"
          />
        </span>
      </div>

      <!-- lang pill -->
      <span
        class="absolute bottom-1.5 right-1.5 rounded-full bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold backdrop-blur-sm transition-opacity duration-200"
        :class="card.lang === 'fr' ? 'text-(--accent-text)' : 'text-(--color-text-mid)'"
      >
        {{ card.lang === 'fr' ? 'FR' : card.lang.toUpperCase() }}
      </span>

      <!-- picked by hand -->
      <span
        v-if="pinned"
        class="absolute bottom-1.5 left-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-(--accent-text) backdrop-blur-sm"
        :title="t('print.pinned')"
      >
        <UIcon name="i-lucide-pin" class="h-3 w-3" />
        <span class="sr-only">{{ t('print.pinned') }}</span>
      </span>

      <!-- DFC badge -->
      <span
        v-if="card.backImageUrl"
        class="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-(--color-text-mid) opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100"
      >
        2 faces
      </span>
    </button>

    <!-- ‹ › step through the printings, in place. Siblings of the card button
         (a button cannot hold buttons), shown on hover or keyboard focus. -->
    <template v-if="cyclable && !card.error && card.imageUrl">
      <button
        v-for="dir in ([-1, 1] as const)"
        :key="dir"
        type="button"
        tabindex="-1"
        class="absolute top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/75 text-white opacity-0 shadow-[var(--shadow-elev-2)] backdrop-blur-sm transition-opacity hover:bg-black/90 focus-visible:opacity-100 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100"
        :class="dir < 0 ? '-left-2' : '-right-2'"
        :aria-label="dir < 0 ? t('print.prev') : t('print.next')"
        :title="dir < 0 ? t('print.prev') : t('print.next')"
        @click.stop="emit('cycle', card, dir)"
      >
        <UIcon :name="dir < 0 ? 'i-lucide-chevron-left' : 'i-lucide-chevron-right'" class="h-4 w-4" />
      </button>
    </template>
  </div>
</template>
