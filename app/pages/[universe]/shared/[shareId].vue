<script setup lang="ts">
import type { GameId } from '#shared/game'
import type { TcgLine } from '#shared/tcg/deck'
import type { TcgCard, TcgGameId } from '#shared/tcg/types'
import { computed, onMounted, ref, watch } from 'vue'
import { deckPath, gameFromSlug, GAMES, libraryPath, sharedPath } from '#shared/game'
import { isTcgGame } from '#shared/tcg/types'
import { TCG_UI } from '~/utils/games/tcg'

// A shared deck of a generic-engine game, read-only: the deck panel without
// its steppers, and every card laid out. A visitor can take a copy.
definePageMeta({ validate: route => isTcgGame(gameFromSlug(route.params.universe)) })

interface SharedDeck { name: string, game: GameId, raw: string, source?: string | null, public: boolean }

const route = useRoute()
const game = gameFromSlug(route.params.universe) as TcgGameId
const shareId = computed(() => String(route.params.shareId))
const { t, locale } = useLocale()
const { createDeck } = useDeckStore()

const { data, status, error } = await useAsyncData(
  () => `shared-${shareId.value}`,
  () => $fetch<{ deck: SharedDeck }>(`/api/shared/${encodeURIComponent(shareId.value)}`)
    .then(r => r.deck)
    .catch((err) => {
      if (fetchStatus(err) === 404)
        return null
      throw err
    }),
)
if (error.value)
  unavailable(error.value)
const deck = computed(() => data.value ?? null)
const loading = computed(() => status.value === 'pending')
const notFound = computed(() => !loading.value && !deck.value)

if (deck.value && deck.value.game !== game)
  await navigateTo(sharedPath(deck.value.game, shareId.value), { replace: true, redirectCode: 301 })
if (import.meta.server && !deck.value)
  setResponseStatus(useRequestEvent()!, 404)

const lang = computed<'fr' | 'en'>(() => locale.value)
const tcgDeck = useTcgDeck({ game, raw: { get: () => deck.value?.raw ?? '', set: () => {} }, lang })
onMounted(() => watch(() => deck.value?.raw, () => tcgDeck.load(), { immediate: true }))

usePublicSeo({
  title: () => (deck.value ? `${deck.value.name} · ${t('share.sharedDeck')}` : t('share.notFound')),
  description: () => `${GAMES[game].label} · ${t('share.sharedDeck')}`,
  noindex: () => !deck.value?.public,
})

/** Each line once, by category then name, as a player reads a list. */
const cards = computed(() => {
  const rank = (c: string) => {
    const i = TCG_UI[game].categories.indexOf(c)
    return i < 0 ? 99 : i
  }
  return tcgDeck.lines.value
    .filter((l): l is TcgLine & { card: TcgCard } => !!l.card)
    .sort((a, b) => rank(a.card.category) - rank(b.card.category) || a.card.name.localeCompare(b.card.name))
})

const sheetOpen = ref(false)
const sheetCard = ref<TcgCard | null>(null)
function openLine(line: TcgLine) {
  if (!line.card)
    return
  sheetCard.value = line.card
  sheetOpen.value = true
}

function copyToMine() {
  if (!deck.value)
    return
  const copy = createDeck({ name: deck.value.name, game, raw: deck.value.raw })
  navigateTo(deckPath(copy))
}

function startWith(card: TcgCard) {
  const fresh = createDeck({ name: card.name, game, raw: `1 ${card.id}` })
  navigateTo(deckPath(fresh))
}
</script>

<template>
  <div class="tcg-shared fade-up">
    <div v-if="loading" class="state">
      <UIcon name="i-lucide-loader-circle" class="h-8 w-8 animate-spin text-(--accent-text)" />
    </div>

    <div v-else-if="notFound || !deck" class="state">
      <UIcon name="i-lucide-unlink" class="h-10 w-10 text-(--color-text-muted)" />
      <p class="text-(--color-text-muted)">
        {{ t('share.notFound') }}
      </p>
      <UButton :to="libraryPath(game)" color="primary" :icon="GAMES[game].icon">
        {{ t('share.home') }}
      </UButton>
    </div>

    <template v-else>
      <header class="head">
        <div class="min-w-0">
          <p class="kicker">
            <UIcon name="i-lucide-share-2" class="h-3.5 w-3.5" />
            {{ t('share.sharedDeck') }} · {{ t('share.viewOnly') }}
          </p>
          <h1 class="title u-display">
            {{ deck.name }}
          </h1>
        </div>
        <UButton color="primary" icon="i-lucide-copy-plus" class="shrink-0" @click="copyToMine">
          {{ t('share.copyToMine') }}
        </UButton>
      </header>

      <div class="layout">
        <TcgDeckPanel
          class="panel"
          readonly
          :format="tcgDeck.format.value"
          :game="game"
          :lines="tcgDeck.lines.value"
          :validation="tcgDeck.validation.value"
          :resolving="tcgDeck.resolving.value"
          :unknown="tcgDeck.unknown.value"
          :unreadable="tcgDeck.unreadable.value"
          :lang="lang"
          @open="openLine"
        />
        <div class="grid">
          <TcgCardTile
            v-for="(line, i) in cards"
            :key="`${line.entry.name}|${line.entry.zone ?? ''}`"
            :game="game"
            :card="line.card"
            :index="i"
            :quantity="line.entry.quantity"
            @open="openLine(line)"
          />
        </div>
      </div>

      <TcgCardSheet v-model:open="sheetOpen" :game="game" :card="sheetCard" :lang="lang" @start="startWith" />
    </template>
  </div>
</template>

<style scoped>
.tcg-shared {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 80px 0;
  text-align: center;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.kicker {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 4px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent-text);
}
.title {
  margin: 0;
  font-size: clamp(28px, 4vw, 44px);
  line-height: 1;
  color: var(--color-text-high);
  overflow-wrap: anywhere;
}
.layout {
  display: grid;
  grid-template-columns: minmax(300px, 380px) 1fr;
  gap: 24px;
  align-items: start;
}
.panel {
  position: sticky;
  top: 80px;
  max-height: calc(100dvh - 100px);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 22px 16px;
  padding: 6px 4px 20px;
}
@media (max-width: 860px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .panel {
    position: static;
    max-height: none;
  }
}
</style>
