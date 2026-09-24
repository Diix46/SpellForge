<script setup lang="ts">
import type { PrintOption } from '~/composables/usePrintings'
import { computed, ref, watch } from 'vue'
import { displayable } from '#shared/mtg/prints'
import { useLocale } from '~/composables/useLocale'
import { printKey, usePrintings } from '~/composables/usePrintings'

// Artwork strip of the card detail modal: every printing that can show in the
// site's language, then — on a French deck — the English ones, pinned "[EN]"
// when picked (a sharp English scan over a low-resolution French one). Always
// visible. Hovering or focusing a thumbnail previews it
// in the modal's big image; a click pins it on the deck entry, and the leading
// "Auto" tile clears the pin. The modal stays open, so the choice is seen.

const props = defineProps<{
  /** English card name (the prints lookup key). Empty disables the fetch. */
  englishName: string
  /** Changes when the displayed card changes — reloads the strip. */
  cardKey: string
  /** The displayed printing `set/number`. */
  currentPrintKey: string
  /** The deck entry's pinned printing `set/number`, empty when automatic. */
  pinnedKey: string
}>()

const emit = defineEmits<{
  /** A printing to pin, or null to go back to the automatic choice. */
  pick: [print: PrintOption | null]
  /** The printing under the pointer or focus, null when it leaves the strip. */
  preview: [print: PrintOption | null]
}>()

const { t, locale } = useLocale()
const { printsOf } = usePrintings()

const prints = ref<PrintOption[]>([])
const loading = ref(false)

watch(() => [props.cardKey, props.englishName, locale.value] as const, async ([, name, lang], _, onCleanup) => {
  // A newer card, name or language supersedes this lookup: drop its answer.
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })
  prints.value = []
  emit('preview', null)
  if (!name) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    // English printings too, unless the site already is in English.
    const list = await printsOf(name, lang, lang !== 'en')
    if (!cancelled)
      prints.value = list
  }
  catch {
    if (!cancelled)
      prints.value = []
  }
  finally {
    if (!cancelled)
      loading.value = false
  }
}, { immediate: true })

const keyOf = (p: PrintOption) => printKey(p.set, p.collectorNumber, p.lang)
// The site's own language first, then the English printings, apart.
const groups = computed(() => {
  const own = displayable(prints.value, locale.value)
  const english = prints.value.filter(p => !own.includes(p))
  return [
    { key: 'own', label: '', items: own },
    { key: 'en', label: t('print.inEnglish'), items: english },
  ].filter(g => g.items.length)
})
// A pin this list does not hold (one it cannot show) is not honoured: the card
// is on its automatic printing.
const pinned = computed(() => {
  const has = (key: string) => prints.value.some(p => keyOf(p) === key)
  if (has(props.pinnedKey))
    return props.pinnedKey
  // An unmarked pin on a card with no printing in this language shows in English.
  const english = props.pinnedKey.replace(/@\w+$/, '@en')
  return !prints.value.some(p => p.lang === locale.value) && has(english) ? english : ''
})
const isPinned = (p: PrintOption) => pinned.value === keyOf(p)
// With no pin, the printing on show is the automatic one: mark it, lighter.
const isAutoShown = (p: PrintOption) => !pinned.value && props.currentPrintKey === keyOf(p)

function titleOf(p: PrintOption): string {
  return [
    `${p.setName} · #${p.collectorNumber}`,
    p.priceEur ? `${p.priceEur} €` : '',
    p.highres ? '' : t('print.lowres'),
  ].filter(Boolean).join(' · ')
}

const hasLowres = computed(() => prints.value.some(p => !p.highres))
</script>

<template>
  <div class="border-t border-(--color-border-subtle) pt-4">
    <div class="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 class="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-(--color-text-mid)">
        <UIcon name="i-lucide-layers" class="h-3.5 w-3.5 text-(--accent-text)" />
        {{ t('print.versions') }}
        <span v-if="prints.length" class="rounded-full bg-(--color-surface-2) px-1.5 text-(--color-text-muted)">{{ prints.length }}</span>
      </h3>
      <p v-if="prints.length > 1" class="text-[11px] text-(--color-text-muted)">
        {{ t('print.hint') }}
      </p>
    </div>

    <div
      v-if="loading"
      class="flex items-center gap-2 font-mono text-xs text-(--color-text-muted)"
    >
      <UIcon name="i-lucide-loader-circle" class="h-4 w-4 animate-spin" />
      {{ t('print.loading') }}
    </div>
    <p
      v-else-if="!prints.length"
      class="font-mono text-xs text-(--color-text-muted)"
    >
      {{ t('print.none') }}
    </p>
    <div
      v-else
      class="print-strip -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 pt-1"
      @mouseleave="emit('preview', null)"
      @focusout="emit('preview', null)"
    >
      <!-- Auto: clear the pin, back to the best printing in the site's language. -->
      <button
        type="button"
        class="grid aspect-[63/88] w-16 shrink-0 snap-start place-items-center rounded-[var(--radius-md)] border border-dashed text-center transition-all"
        :class="!pinned
          ? 'border-(--accent-border) bg-(--accent-soft) text-(--accent-text) ring-2 ring-(--accent-border)'
          : 'border-(--color-border-strong) text-(--color-text-muted) hover:border-(--accent-border) hover:text-(--accent-text)'"
        :title="t('print.autoTitle')"
        :aria-pressed="!pinned"
        @click="emit('pick', null)"
      >
        <span class="flex flex-col items-center gap-1 font-mono text-[10px] uppercase tracking-wider">
          <UIcon name="i-lucide-wand-sparkles" class="h-4 w-4" />
          {{ t('print.auto') }}
        </span>
      </button>

      <template v-for="g in groups" :key="g.key">
        <span
          v-if="g.label"
          class="flex w-6 shrink-0 items-center justify-center border-l border-(--color-border-subtle) font-mono text-[9px] uppercase tracking-wider text-(--color-text-muted) [writing-mode:vertical-rl]"
        >{{ g.label }}</span>
        <button
          v-for="p in g.items"
          :key="p.id"
          type="button"
          class="relative w-16 shrink-0 snap-start overflow-hidden rounded-[var(--radius-md)] ring-2 transition-all focus-visible:outline-none"
          :class="isPinned(p)
            ? 'ring-(--accent-border)'
            : isAutoShown(p)
              ? 'ring-(--color-border-strong)'
              : 'ring-transparent hover:ring-(--color-border-strong) focus-visible:ring-(--color-border-strong)'"
          :title="titleOf(p)"
          :aria-label="titleOf(p)"
          :aria-pressed="isPinned(p)"
          @mouseenter="emit('preview', p)"
          @focus="emit('preview', p)"
          @click="emit('pick', p)"
        >
          <img
            v-if="p.image"
            :src="p.image"
            :alt="p.setName"
            loading="lazy"
            class="block aspect-[63/88] w-full object-cover"
          >
          <span
            class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 bg-black/70 px-1 py-0.5 font-mono text-[8px] text-white/80"
          >
            <span class="truncate uppercase">{{ p.set }}</span>
            <span class="shrink-0 rounded-sm bg-white/15 px-0.5">{{ p.lang.toUpperCase() }}</span>
          </span>
          <span
            v-if="isPinned(p)"
            class="absolute left-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full text-(--color-bg-base)"
            :style="{ background: 'var(--accent)' }"
            aria-hidden="true"
          >
            <UIcon name="i-lucide-pin" class="h-2.5 w-2.5" />
          </span>
          <span
            v-if="!p.highres"
            class="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-amber-300"
            aria-hidden="true"
          >
            <UIcon name="i-lucide-scan-line" class="h-2.5 w-2.5" />
          </span>
        </button>
      </template>
    </div>

    <p v-if="hasLowres" class="mt-1 flex items-center gap-1 text-[10px] text-(--color-text-muted)">
      <UIcon name="i-lucide-scan-line" class="h-3 w-3 text-amber-400" />
      {{ t('print.lowres') }}
    </p>
  </div>
</template>

<style scoped>
.print-strip {
  scrollbar-width: thin;
}
</style>
