<script setup lang="ts">
import type { PrintOption } from '~/composables/usePrintings'
import { computed } from 'vue'
import { useLocale } from '~/composables/useLocale'

// One printing thumbnail, shared by the artwork strip and the gallery grid:
// set code and language along the bottom, a pin when it is the chosen one, a
// scan mark when Scryfall only has a low-resolution image.

const props = defineProps<{
  print: PrintOption
  /** The printing pinned on the deck entry. */
  pinned: boolean
  /** No pin: this is the printing shown automatically. */
  autoShown: boolean
}>()

const emit = defineEmits<{
  pick: [print: PrintOption]
  preview: [print: PrintOption]
}>()

const { t } = useLocale()

const title = computed(() => [
  `${props.print.setName} · #${props.print.collectorNumber}`,
  props.print.artist ?? '',
  props.print.priceEur ? `${props.print.priceEur} €` : '',
  props.print.highres ? '' : t('print.lowres'),
].filter(Boolean).join(' · '))
</script>

<template>
  <button
    type="button"
    class="relative overflow-hidden rounded-[var(--radius-md)] ring-2 transition-all focus-visible:outline-none"
    :class="pinned
      ? 'ring-(--accent-border)'
      : autoShown
        ? 'ring-(--color-border-strong)'
        : 'ring-transparent hover:ring-(--color-border-strong) focus-visible:ring-(--color-border-strong)'"
    :title="title"
    :aria-label="title"
    :aria-pressed="pinned"
    @mouseenter="emit('preview', print)"
    @focus="emit('preview', print)"
    @click="emit('pick', print)"
  >
    <img
      v-if="print.image"
      :src="print.image"
      :alt="print.setName"
      loading="lazy"
      class="block aspect-[63/88] w-full object-cover"
    >
    <span
      class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 bg-black/70 px-1 py-0.5 font-mono text-[8px] text-white/80"
    >
      <span class="truncate uppercase">{{ print.set }}</span>
      <span class="shrink-0 rounded-sm bg-white/15 px-0.5">{{ print.lang.toUpperCase() }}</span>
    </span>
    <span
      v-if="pinned"
      class="absolute left-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full text-(--color-bg-base)"
      :style="{ background: 'var(--accent)' }"
      aria-hidden="true"
    >
      <UIcon name="i-lucide-pin" class="h-2.5 w-2.5" />
    </span>
    <span
      v-if="!print.highres"
      class="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-amber-300"
      aria-hidden="true"
    >
      <UIcon name="i-lucide-scan-line" class="h-2.5 w-2.5" />
    </span>
  </button>
</template>
