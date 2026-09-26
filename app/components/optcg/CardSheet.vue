<script setup lang="ts">
import type { OptcgCard, OptcgPrint } from '#shared/optcg/types'
import { computed, ref, shallowRef, watch } from 'vue'
import { optcgPrintingId } from '#shared/collection'
import { cardPath } from '#shared/game'

// The card view in a dialog. In a deck it also adds, removes and swaps the art
// of the line it came from; from the library, a Leader can start a deck. Never
// a print or download action.
const props = withDefaults(defineProps<{
  open: boolean
  card: OptcgCard | null
  lang: 'fr' | 'en'
  /** Copies in the deck, all arts together; null outside a deck. */
  quantity?: number | null
  /** The art the deck line uses, when opened from the deck. */
  lineArt?: string | null
}>(), { quantity: null, lineArt: null })

const emit = defineEmits<{
  'update:open': [value: boolean]
  /** `pinned`: the player picked an art other than the one the sheet opened on. */
  'add': [card: OptcgCard, from: HTMLElement, pinned: boolean]
  'remove': [card: OptcgCard]
  'setArt': [card: OptcgCard]
  /** From the library: start a new deck around this Leader. */
  'start': [card: OptcgCard]
}>()

const { t } = useLocale()

const prints = shallowRef<OptcgPrint[]>([])
const shown = ref<string | null>(null)

watch(() => [props.open, props.card?.number, props.lang] as const, async ([open, number, lang]) => {
  if (!open || !number)
    return
  shown.value = props.lineArt ?? props.card?.id ?? null
  prints.value = []
  try {
    prints.value = (await $fetch<{ prints: OptcgPrint[] }>('/api/optcg/prints', { params: { number, lang } })).prints
  }
  catch {
    prints.value = []
  }
}, { immediate: true })

const inDeck = computed(() => props.quantity !== null)
const opened = computed(() => props.lineArt ?? props.card?.id)
const artChanged = computed(() => inDeck.value && shown.value !== (props.lineArt ?? props.card?.number))

// Adding the art on display to the collection, in its language (members only).
const members = useMembersOnly()
const collectionOpen = ref(false)
const collectionPrinting = ref<string | undefined>()
function addToCollection(card: OptcgCard) {
  collectionPrinting.value = optcgPrintingId(card.lang, card.id)
  members.require('collection', () => (collectionOpen.value = true))
}

function onAdd(e: MouseEvent, card: OptcgCard) {
  emit('add', card, e.currentTarget as HTMLElement, shown.value !== opened.value)
}
</script>

<template>
  <UModal
    :open="open"
    :title="card?.name ?? ''"
    :description="card ? `${card.number} · ${t(`optcg.category.${card.category}`)}` : ''"
    :ui="{ content: 'sm:max-w-3xl sheet', body: 'p-0 sm:p-0' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <OptcgCardView v-if="card" v-model:shown="shown" :card="card" :prints="prints" :lang="lang">
        <template #actions="{ shownCard }">
          <footer v-if="!inDeck" class="actions">
            <UButton v-if="card.category === 'Leader'" color="primary" icon="i-lucide-anchor" @click="emit('start', shownCard)">
              {{ t('optcg.library.startWith') }}
            </UButton>
            <UButton color="neutral" variant="subtle" icon="i-lucide-gem" @click="addToCollection(shownCard)">
              {{ t('collection.addToCollection') }}
            </UButton>
            <UButton color="neutral" variant="ghost" icon="i-lucide-link" :to="cardPath('optcg', card.number)">
              {{ t('card.page') }}
            </UButton>
          </footer>
          <footer v-else class="actions">
            <UButton color="primary" icon="i-lucide-plus" @click="onAdd($event, shownCard)">
              {{ t('optcg.add.button') }}
              <span v-if="quantity" class="opacity-70">({{ quantity }})</span>
            </UButton>
            <UButton v-if="quantity" color="neutral" variant="subtle" icon="i-lucide-minus" @click="emit('remove', card)">
              {{ t('optcg.add.remove') }}
            </UButton>
            <UButton v-if="artChanged" color="neutral" variant="outline" icon="i-lucide-image" @click="emit('setArt', shownCard)">
              {{ t('optcg.add.setArt') }}
            </UButton>
          </footer>
        </template>
      </OptcgCardView>
    </template>
  </UModal>
  <CollectionAddDialog v-if="card" v-model:open="collectionOpen" game="optcg" :initial-query="card.number" :initial-printing="collectionPrinting" />
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 4px;
}
</style>
