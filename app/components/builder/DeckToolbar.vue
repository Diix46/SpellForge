<script setup lang="ts">
import { useLocale } from '~/composables/useLocale'

// The deck page's unified toolbar, for every game: back · editable title +
// colour dots + card count (+ est. cost) · build/utility actions
// (Import/Export, Share, or Save for a guest) · terminal actions where the game
// has them (Aperçu, Acheter: Magic only). One row so the workspace + footer fit
// on one screen. Pure presentation — title is v-model, the rest props/emits.

withDefaults(defineProps<{
  deckName: string
  /** CSS colours of the deck's identity (commander or Leader). */
  dots: string[]
  cardCount: number
  priceTotal?: number
  loggedIn: boolean
  canUndo: boolean
  canRedo: boolean
  /** Proxy preview and PDF: Magic only. */
  printable?: boolean
  /** Buying links: Magic only. */
  buyable?: boolean
}>(), { priceTotal: 0, printable: false, buyable: false })

const emit = defineEmits<{
  'update:deckName': [value: string]
  'openImportExport': []
  'share': []
  'save': []
  'openPreview': []
  'openBuy': []
  'undo': []
  'redo': []
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
      to="/decks"
      :aria-label="t('nav.backToDecks')"
      class="shrink-0"
    />
    <div class="flex shrink-0 items-center gap-0.5">
      <UButton
        icon="i-lucide-undo-2"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="!canUndo"
        :aria-label="t('build.undo')"
        :title="t('build.undo')"
        @click="emit('undo')"
      />
      <UButton
        icon="i-lucide-redo-2"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="!canRedo"
        :aria-label="t('build.redo')"
        :title="t('build.redo')"
        @click="emit('redo')"
      />
    </div>
    <div class="flex min-w-[180px] flex-1 items-center gap-2.5">
      <input
        :value="deckName"
        name="deck-name"
        :aria-label="t('modal.deckName')"
        class="u-display min-w-0 flex-1 truncate bg-transparent text-xl text-(--color-text-high) caret-(--accent) focus:outline-none"
        @input="emit('update:deckName', ($event.target as HTMLInputElement).value)"
      >
      <div class="flex shrink-0 items-center gap-1">
        <span
          v-for="(c, i) in dots"
          :key="i"
          class="h-2.5 w-2.5 rounded-full"
          :style="{ background: c, boxShadow: `0 0 6px ${c}` }"
        />
        <span class="ml-1 font-mono text-xs text-(--color-text-muted)">{{ cardCount }}</span>
      </div>
      <!-- Est. cost: a glanceable readout of the deck total while building.
           Not a button — purchasing is the single "Acheter" action below. -->
      <span
        v-if="priceTotal > 0"
        class="shrink-0 rounded-full bg-(--color-surface-2) px-2.5 py-1 font-mono text-xs font-semibold text-(--accent-text) ring-1 ring-(--color-border-subtle)"
        :title="t('buy.estTotal')"
      >
        ~{{ priceTotal.toFixed(0) }} €
      </span>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <UButton
        icon="i-lucide-clipboard-list"
        color="neutral"
        variant="subtle"
        size="sm"
        :aria-label="t('build.importExport')"
        @click="emit('openImportExport')"
      >
        <span class="hidden lg:inline">{{ t('build.importExport') }}</span>
      </UButton>
      <UButton
        v-if="loggedIn"
        icon="i-lucide-share-2"
        color="neutral"
        variant="subtle"
        size="sm"
        :aria-label="t('share.button')"
        @click="emit('share')"
      >
        <span class="hidden lg:inline">{{ t('share.button') }}</span>
      </UButton>
      <!-- A guest's deck is already saved locally; this opens the sign-up offer. -->
      <UButton
        v-else
        icon="i-lucide-save"
        color="neutral"
        variant="subtle"
        size="sm"
        :aria-label="t('deck.save')"
        @click="emit('save')"
      >
        <span class="hidden lg:inline">{{ t('deck.save') }}</span>
      </UButton>

      <!-- Terminal actions: review & print (Aperçu), buy (Acheter). Separated
           from the build/utility actions by a hairline. -->
      <span v-if="printable || buyable" class="mx-0.5 h-6 w-px bg-(--color-border-subtle)" aria-hidden="true" />
      <UButton
        v-if="printable"
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
        v-if="buyable"
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
