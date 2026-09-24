<script setup lang="ts">
import type { PinFields } from '#shared/mtg/prints'
import type { PrintOption } from '~/composables/usePrintings'
import { computed, ref, watch } from 'vue'
import { useLocale } from '~/composables/useLocale'
import { pinFor, printKey, usePrintings } from '~/composables/usePrintings'

// Artworks of the card detail modal: every printing that can show in the
// site's language, and — on a French deck — the English ones, pinned "[EN]"
// when picked (a sharp English scan over a low-resolution French one), in the
// gallery grid (search, filters, sort). Hovering or focusing a thumbnail
// previews it in the modal's big image; a click pins it on the deck entry, and
// "Auto" clears the pin. The modal stays open, so the choice is seen.

const props = defineProps<{
  /** English card name (the prints lookup key). Empty disables the fetch. */
  englishName: string
  /** Changes when the displayed card changes — reloads the gallery. */
  cardKey: string
  /** The displayed printing `set/number`. */
  currentPrintKey: string
  /** The deck entry's pinned printing `set/number`, empty when automatic. */
  pinnedKey: string
}>()

const emit = defineEmits<{
  /** A printing to pin (with the pin that shows it), or null to go back to the automatic choice. */
  pick: [print: PrintOption | null, pin: PinFields]
  /** The printing under the pointer or focus, null when it leaves the gallery. */
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
function isPinned(p: PrintOption): boolean {
  return pinned.value === keyOf(p)
}
// With no pin, the printing on show is the automatic one: mark it, lighter.
const isAutoShown = (p: PrintOption) => !pinned.value && props.currentPrintKey === keyOf(p)

// Nothing to do when the tile is already the pinned one (or Auto already is).
function pick(p: PrintOption | null) {
  if (p ? isPinned(p) : !pinned.value)
    return
  emit('pick', p, p ? pinFor(p, locale.value, prints.value) : {})
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
      <div class="flex items-center gap-3">
        <p v-if="prints.length > 1" class="hidden text-[11px] text-(--color-text-muted) sm:block">
          {{ t('print.hint') }}
        </p>
        <button
          v-if="prints.length"
          type="button"
          class="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 transition-colors"
          :class="!pinned ? 'bg-(--accent-soft) text-(--accent-text) ring-(--accent-border)' : 'text-(--color-text-muted) ring-(--color-border-strong) hover:text-(--accent-text)'"
          :aria-pressed="!pinned"
          :title="t('print.autoTitle')"
          @click="pick(null)"
        >
          <UIcon name="i-lucide-wand-sparkles" class="h-3.5 w-3.5" />
          {{ t('print.auto') }}
        </button>
      </div>
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
    <CardPrintGallery
      v-else
      :prints="prints"
      :is-pinned="isPinned"
      :is-auto-shown="isAutoShown"
      @pick="pick"
      @preview="emit('preview', $event)"
    />

    <p v-if="hasLowres" class="mt-1 flex items-center gap-1 text-[10px] text-(--color-text-muted)">
      <UIcon name="i-lucide-scan-line" class="h-3 w-3 text-amber-400" />
      {{ t('print.lowres') }}
    </p>
  </div>
</template>
