<script setup lang="ts">
import type { GameId } from '#shared/game'
import { computed } from 'vue'
import { addToDecklist } from '#shared/deckAdd'
import { deckPath } from '#shared/game'

// "Add to deck…" on a card's page or sheet: the member's (or guest's) decks
// of the card's game, most recent first; one copy goes in, written in the
// game's own list format (shared/deckAdd), and a toast opens the deck.
const props = defineProps<{
  game: GameId
  /** What a list names the card by: Magic's English name, One Piece's number, a printing id. */
  cardKey: string
  /** Generic engine: the zone its rules put it in. */
  zone?: string
}>()

const { t, formatShortDate } = useLocale()
const toast = useToast()
const { decks, updateDeck } = useDeckStore()

const mine = computed(() => decks.value.filter(d => d.game === props.game).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12))
const items = computed(() => [mine.value.map(d => ({
  label: d.name,
  suffix: formatShortDate(d.updatedAt),
  icon: 'i-lucide-layers',
  onSelect: () => add(d.id),
}))])

function add(id: string) {
  const deck = mine.value.find(d => d.id === id)
  if (!deck)
    return
  const { raw, added } = addToDecklist(props.game, deck.raw, props.cardKey, props.zone)
  if (!added) {
    toast.add({ title: t('addToDeck.already').replace('{deck}', deck.name), color: 'warning', icon: 'i-lucide-info' })
    return
  }
  updateDeck(deck.id, { raw })
  toast.add({
    title: t('addToDeck.done').replace('{deck}', deck.name),
    color: 'success',
    icon: 'i-lucide-check',
    actions: [{ label: t('addToDeck.open'), to: deckPath(deck), color: 'neutral', variant: 'outline' }],
  })
}
</script>

<template>
  <UDropdownMenu v-if="mine.length" :items="items" :content="{ align: 'start' }">
    <UButton color="neutral" variant="subtle" icon="i-lucide-list-plus" trailing-icon="i-lucide-chevron-down">
      {{ t('addToDeck.button') }}
    </UButton>
  </UDropdownMenu>
</template>
