<script setup lang="ts">
import { ref, watch } from 'vue'
import { useLocale } from '~/composables/useLocale'

// Collapsible "pick a specific printing" gallery for the card detail modal. Owns
// its own open/loading/prints state and lazily fetches /api/cards/prints the
// first time it's opened. Resets when the card changes. Extracted from
// CardDetailModal so the modal stays focused on the card's info layout.

interface PrintOption {
  id: string
  set: string
  setName: string
  collectorNumber: string
  lang: string
  image: string | null
  priceEur: string | null
  promo: boolean
}

const props = defineProps<{
  /** Whether the parent modal is open — every fresh open starts the gallery
   *  collapsed (the modal instance persists across opens, so we can't rely on
   *  unmount). Mirrors the original "reset on each new card view" behaviour. */
  open: boolean
  /** English card name (the prints lookup key). Empty disables the fetch. */
  englishName: string
  /** Changes when the displayed card changes — used to reset the gallery. */
  cardKey: string
  /** The currently-displayed printing `set/number` (highlight). */
  currentPrintKey: string
  /** The deck entry's pinned printing `set/number`, if any (highlight wins). */
  pinnedKey: string
}>()

const emit = defineEmits<{
  pick: [payload: { set: string, collectorNumber: string }]
}>()

const { t, locale } = useLocale()

const show = ref(false)
const prints = ref<PrintOption[]>([])
const loading = ref(false)

function reset() {
  show.value = false
  prints.value = []
}
// Reset when the card changes (in-place swap) OR each time the modal opens
// (a persisted instance must still start collapsed on every fresh view).
watch(() => props.cardKey, reset)
watch(() => props.open, (isOpen) => {
  if (isOpen)
    reset()
})

async function toggle() {
  show.value = !show.value
  if (show.value && prints.value.length === 0 && props.englishName) {
    loading.value = true
    try {
      const res = await $fetch<{ prints: PrintOption[] }>('/api/cards/prints', {
        params: { name: props.englishName, lang: locale.value },
      })
      prints.value = res.prints
    }
    catch {
      prints.value = []
    }
    finally {
      loading.value = false
    }
  }
}

function isSelected(p: PrintOption): boolean {
  return (props.pinnedKey || props.currentPrintKey) === `${p.set}/${p.collectorNumber}`
}
</script>

<template>
  <div class="border-t border-(--color-border-subtle) pt-4">
    <button
      type="button"
      class="flex w-full items-center justify-between text-left font-mono text-[11px] uppercase tracking-wider text-(--color-text-mid) transition-colors hover:text-(--color-text-high)"
      @click="toggle"
    >
      <span class="flex items-center gap-1.5">
        <UIcon name="i-lucide-layers" class="h-3.5 w-3.5 text-(--accent-text)" />
        {{ t('print.versions') }}
      </span>
      <UIcon
        :name="show ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="h-4 w-4"
      />
    </button>

    <div v-if="show" class="mt-3">
      <div
        v-if="loading"
        class="flex items-center gap-2 font-mono text-xs text-(--color-text-muted)"
      >
        <UIcon name="i-lucide-loader-circle" class="h-4 w-4 animate-spin" />
        {{ t('print.loading') }}
      </div>
      <div
        v-else-if="!prints.length"
        class="font-mono text-xs text-(--color-text-muted)"
      >
        {{ t('print.none') }}
      </div>
      <div
        v-else
        class="grid max-h-[40vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4"
      >
        <button
          v-for="p in prints"
          :key="p.id"
          type="button"
          class="group/print relative overflow-hidden rounded-[var(--radius-md)] ring-2 transition-all"
          :class="isSelected(p)
            ? 'ring-(--accent-border)'
            : 'ring-transparent hover:ring-(--color-border-strong)'"
          :title="`${p.setName} · #${p.collectorNumber}${p.priceEur ? ` · ${p.priceEur} €` : ''}`"
          @click="emit('pick', { set: p.set, collectorNumber: p.collectorNumber })"
        >
          <img
            v-if="p.image"
            :src="p.image"
            :alt="p.setName"
            loading="lazy"
            class="block aspect-[63/88] w-full object-cover"
          >
          <span
            class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/70 px-1.5 py-0.5 font-mono text-[8px] text-(--color-text-mid)"
          >
            <span class="truncate uppercase">{{ p.set }}</span>
            <span class="shrink-0 rounded-sm bg-white/10 px-1">{{ p.lang.toUpperCase() }}</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
