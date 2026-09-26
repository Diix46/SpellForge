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
  /** The deck against the member's collection (none for a guest). */
  owned?: { owned: number, total: number } | null
  /** Where that collection lives. */
  collectionTo?: string
}>(), { priceTotal: 0, printable: false, buyable: false, owned: null, collectionTo: undefined })

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
      <!-- Owned: how much of the deck the collection already covers. -->
      <NuxtLink
        v-if="owned"
        :to="collectionTo"
        class="owned-pill shrink-0"
        :class="{ 'is-full': owned.owned >= owned.total }"
        :title="t('collection.deckOwnedHint').replace('{owned}', String(owned.owned)).replace('{total}', String(owned.total))"
      >
        <UIcon name="i-lucide-gem" class="h-3.5 w-3.5" />
        {{ Math.floor((owned.owned / owned.total) * 100) }} %
        <span class="owned-bar" aria-hidden="true"><span :style="{ transform: `scaleX(${owned.owned / owned.total})` }" /></span>
      </NuxtLink>
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

<style scoped>
.owned-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-surface-2);
  box-shadow: inset 0 0 0 1px var(--color-border-subtle);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-high);
}
.owned-pill.is-full {
  color: #23945a;
}
.owned-bar {
  position: relative;
  overflow: hidden;
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: var(--color-surface-3);
}
.owned-bar span {
  position: absolute;
  inset: 0;
  transform-origin: left;
  border-radius: inherit;
  background: currentColor;
  transition: transform 0.4s ease-out;
}
</style>
