<script setup lang="ts">
import type { ChecklistCard } from '#shared/collection'
import type { GameId } from '#shared/game'
import type { OptcgCard } from '#shared/optcg/types'
import type { TcgCard } from '#shared/tcg/types'
import type { ResolvedRow } from '~/composables/scryfall/toResolved'
import type { ResolvedCard } from '~/composables/useScryfall'
import { ref, shallowRef, watch } from 'vue'
import { parseOptcgPrintingId } from '#shared/collection'
import { deckPath } from '#shared/game'
import { isTcgGame } from '#shared/tcg/types'
import { toResolved } from '~/composables/scryfall/toResolved'

// A binder pocket's card, up close: the game's own card view (Magic's detail
// modal, One Piece's sheet, the generic engine's sheet), on the printing the
// pocket holds. Opened by a tap on the pocket; adding is the pocket's +.
const props = defineProps<{ game: GameId, code: string, card: ChecklistCard | null }>()
const open = defineModel<boolean>('open', { required: true })
const { locale } = useLocale()
const { createDeck } = useDeckStore()

const mtg = shallowRef<ResolvedCard | null>(null)
const optcg = shallowRef<OptcgCard | null>(null)
const tcg = shallowRef<TcgCard | null>(null)
const failed = ref(false)

watch(() => [open.value, props.card?.printingId, locale.value] as const, async ([isOpen]) => {
  const c = props.card
  if (!isOpen || !c)
    return
  mtg.value = optcg.value = tcg.value = null
  failed.value = false
  const lang = locale.value === 'fr' ? 'fr' : 'en'
  const art = parseOptcgPrintingId(c.printingId)?.artId ?? c.printingId
  try {
    if (props.game === 'mtg') {
      const entry = { quantity: 1, name: c.name, set: props.code, collectorNumber: c.number }
      const { cards } = await $fetch<{ cards: ResolvedRow[] }>('/api/cards/resolve', { method: 'POST', body: { lang, entries: [{ name: entry.name, set: entry.set, collectorNumber: entry.collectorNumber }] } })
      mtg.value = toResolved(entry, cards[0], lang)
    }
    else if (props.game === 'optcg') {
      const { cards } = await $fetch<{ cards: (OptcgCard | null)[] }>('/api/optcg/resolve', { method: 'POST', body: { lang, entries: [{ number: c.number, id: art }] } })
      optcg.value = cards[0] ?? null
    }
    else if (isTcgGame(props.game)) {
      const { cards } = await $fetch<{ cards: (TcgCard | null)[] }>(`/api/tcg/${props.game}/resolve`, { method: 'POST', body: { lang, ids: [art] } })
      tcg.value = cards[0] ?? null
    }
  }
  catch {
    failed.value = true
  }
}, { immediate: true })

// From the sheet, a card can start a deck of its own.
function start(first: string) {
  navigateTo(deckPath(createDeck({ name: props.card?.printedName ?? props.card?.name ?? '', game: props.game, raw: first })))
}
</script>

<template>
  <CardDetailModal v-if="game === 'mtg'" v-model:open="open" :card="mtg" library @set-commander="c => c.card && start(`1 ${c.card.name}`)" />
  <OptcgCardSheet v-else-if="game === 'optcg'" v-model:open="open" :card="optcg" :lang="locale === 'fr' ? 'fr' : 'en'" @start="c => start(`1x${c.id}`)" />
  <TcgCardSheet v-else-if="isTcgGame(game)" v-model:open="open" :game="game" :card="tcg" :lang="locale === 'fr' ? 'fr' : 'en'" @start="c => start(`1 ${c.id}`)" />
</template>
