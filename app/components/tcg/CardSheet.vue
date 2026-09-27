<script setup lang="ts">
import type { TcgCard, TcgGameId } from '#shared/tcg/types'
import { computed, ref, shallowRef, watch } from 'vue'
import { optcgPrintingId } from '#shared/collection'
import { cardPath } from '#shared/game'
import { tcgLabel } from '~/utils/games/tcg'

// The card view in a dialog. From the library: to the collection, the
// wishlist, a new deck, its page. In a deck: add, remove, and swap the
// line's printing for the one on display.
const props = withDefaults(defineProps<{
  game: TcgGameId
  open: boolean
  card: TcgCard | null
  lang: 'fr' | 'en'
  /** Copies in the deck, every printing together; null outside a deck. */
  quantity?: number | null
  /** The deck line's printing, when opened from the deck. */
  linePrinting?: string | null
}>(), { quantity: null, linePrinting: null })

const emit = defineEmits<{
  'update:open': [value: boolean]
  'add': [card: TcgCard, from: HTMLElement]
  'remove': [card: TcgCard]
  'setPrinting': [card: TcgCard]
  'start': [card: TcgCard]
}>()

const { t } = useLocale()
const prints = shallowRef<TcgCard[]>([])
const shown = ref<string | null>(null)

watch(() => [props.open, props.card?.id, props.lang] as const, async ([open, id, lang]) => {
  if (!open || !id)
    return
  shown.value = props.linePrinting ?? id
  prints.value = []
  try {
    prints.value = (await $fetch<{ prints: TcgCard[] }>(`/api/tcg/${props.game}/prints`, { params: { id, lang } })).prints
  }
  catch {
    prints.value = []
  }
}, { immediate: true })

const inDeck = computed(() => props.quantity !== null)
const printingChanged = computed(() => inDeck.value && !!props.linePrinting && shown.value !== props.linePrinting)
const description = computed(() => props.card ? [tcgLabel(t, props.game, 'category', props.card.category), props.card.setName ?? props.card.set].filter(Boolean).join(' · ') : '')

// To the collection: the printing on display, in its language (members only).
const members = useMembersOnly()
const collectionOpen = ref(false)
const collectionPrinting = ref<string | undefined>()
function addToCollection(card: TcgCard) {
  collectionPrinting.value = optcgPrintingId(card.lang, card.id)
  members.require('collection', () => (collectionOpen.value = true))
}
const wishlist = useWishlist(props.game)
function addToWishlist(card: TcgCard) {
  members.require('collection', () => wishlist.add(optcgPrintingId(card.lang, card.id)))
}
</script>

<template>
  <UModal
    :open="open"
    :title="card?.name ?? ''"
    :description="description"
    :ui="{ content: 'sm:max-w-3xl sheet', body: 'p-0 sm:p-0' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <TcgCardView v-if="card" v-model:shown="shown" :game="game" :card="card" :prints="prints" :lang="lang">
        <template #actions="{ shownCard }">
          <footer v-if="!inDeck" class="actions">
            <UButton color="primary" icon="i-lucide-layers" @click="emit('start', shownCard)">
              {{ t('tcg.startWith') }}
            </UButton>
            <UButton color="neutral" variant="subtle" icon="i-lucide-gem" @click="addToCollection(shownCard)">
              {{ t('collection.addToCollection') }}
            </UButton>
            <UButton color="neutral" variant="subtle" icon="i-lucide-heart" :aria-label="t('collection.wish.add')" :title="t('collection.wish.add')" @click="addToWishlist(shownCard)" />
            <UButton color="neutral" variant="ghost" icon="i-lucide-link" :to="cardPath(game, shownCard.id)">
              {{ t('card.page') }}
            </UButton>
          </footer>
          <footer v-else class="actions">
            <UButton color="primary" icon="i-lucide-plus" @click="emit('add', shownCard, $event.currentTarget as HTMLElement)">
              {{ t('tcg.add') }}
              <span v-if="quantity" class="opacity-70">({{ quantity }})</span>
            </UButton>
            <UButton v-if="quantity" color="neutral" variant="subtle" icon="i-lucide-minus" @click="emit('remove', card)">
              {{ t('tcg.remove') }}
            </UButton>
            <UButton v-if="printingChanged" color="neutral" variant="outline" icon="i-lucide-image" @click="emit('setPrinting', shownCard)">
              {{ t('tcg.setPrinting') }}
            </UButton>
          </footer>
        </template>
      </TcgCardView>
    </template>
  </UModal>
  <CollectionAddDialog v-if="card" v-model:open="collectionOpen" :game="game" :initial-query="card.nameEn ?? card.name" :initial-printing="collectionPrinting" />
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 4px;
}
</style>
