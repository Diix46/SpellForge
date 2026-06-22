<script setup lang="ts">
import type { ManaColor } from '~/composables/useMtg'
import { useLocale } from '~/composables/useLocale'

// The deck page's unified toolbar: back · editable title + colour pips + card
// count + est-cost chip · build/utility actions (Import/Export, Resolve, Share)
// · terminal actions (Aperçu, Acheter). One row so the workspace + footer fit on
// one screen. Pure presentation — title is v-model, everything else is props/emits.

defineProps<{
  deckName: string
  themeColors: ManaColor[]
  cardCount: number
  priceTotal: number
  loggedIn: boolean
  sharing: boolean
  fetching: boolean
  fetchProgress: { loaded: number, total: number }
  /** Show the manual Resolve button (nothing loaded yet, or list went stale). */
  showResolve: boolean
  colorVar: (c: ManaColor) => string
}>()

const emit = defineEmits<{
  'update:deckName': [value: string]
  'openImportExport': []
  'resolve': []
  'share': []
  'openPreview': []
  'openBuy': []
}>()

const { t } = useLocale()
</script>

<template>
  <!-- back · title + pips · actions, all on one row so the deck workspace AND the
       footer fit within one screen. Wraps on narrow viewports. -->
  <div class="deck-toolbar mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
    <UButton
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      to="/"
      :aria-label="t('nav.backToDecks')"
      class="shrink-0"
    />
    <div class="flex min-w-[180px] flex-1 items-center gap-2.5">
      <input
        :value="deckName"
        name="deck-name"
        aria-label="Nom du deck"
        class="min-w-0 flex-1 truncate bg-transparent font-display text-xl font-bold text-(--color-text-high) caret-(--accent) focus:outline-none"
        @input="emit('update:deckName', ($event.target as HTMLInputElement).value)"
      >
      <div class="flex shrink-0 items-center gap-1">
        <span
          v-for="c in themeColors"
          :key="c"
          class="h-2.5 w-2.5 rounded-full"
          :style="{ background: colorVar(c), boxShadow: `0 0 6px ${colorVar(c)}` }"
        />
        <span class="ml-1 font-mono text-xs text-(--color-text-muted)">{{ cardCount }}</span>
      </div>
      <!-- Est. cost chip: glance the price while building; click to open Buy. -->
      <button
        v-if="priceTotal > 0"
        type="button"
        class="shrink-0 rounded-full bg-(--color-surface-2) px-2.5 py-1 font-mono text-xs font-semibold text-(--accent-text) ring-1 ring-(--color-border-subtle) transition-colors hover:bg-(--color-surface-3)"
        :title="t('buy.estTotal')"
        @click="emit('openBuy')"
      >
        ~{{ priceTotal.toFixed(0) }} €
      </button>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <UButton
        icon="i-lucide-clipboard-list"
        color="neutral"
        variant="subtle"
        size="sm"
        @click="emit('openImportExport')"
      >
        <span class="hidden lg:inline">{{ t('build.importExport') }}</span>
      </UButton>
      <UButton
        v-if="showResolve"
        :loading="fetching"
        :disabled="cardCount === 0 || fetching"
        color="neutral"
        variant="subtle"
        size="sm"
        icon="i-lucide-refresh-cw"
        @click="emit('resolve')"
      >
        <span v-if="fetching">{{ fetchProgress.loaded }}/{{ fetchProgress.total }}</span>
        <span v-else class="hidden lg:inline">{{ t('build.resolve') }}</span>
      </UButton>
      <UButton
        v-if="loggedIn"
        icon="i-lucide-share-2"
        color="neutral"
        variant="subtle"
        size="sm"
        :loading="sharing"
        @click="emit('share')"
      >
        <span class="hidden lg:inline">{{ t('share.button') }}</span>
      </UButton>

      <!-- Terminal actions: review & print (Aperçu), buy (Acheter). Separated
           from the build/utility actions by a hairline. -->
      <span class="mx-0.5 h-6 w-px bg-(--color-border-subtle)" aria-hidden="true" />
      <UButton
        icon="i-lucide-eye"
        color="neutral"
        variant="subtle"
        size="sm"
        :disabled="cardCount === 0"
        @click="emit('openPreview')"
      >
        <span class="hidden sm:inline">{{ t('tab.preview') }}</span>
      </UButton>
      <UButton
        icon="i-lucide-shopping-cart"
        color="primary"
        variant="solid"
        size="sm"
        :disabled="cardCount === 0"
        @click="emit('openBuy')"
      >
        <span class="hidden sm:inline">{{ t('tab.buy') }}</span>
      </UButton>
    </div>
  </div>
</template>
