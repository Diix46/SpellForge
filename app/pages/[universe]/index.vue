<script setup lang="ts">
import type { TcgBrowseResponse, TcgCard, TcgGameId } from '#shared/tcg/types'
import type { TcgFilters } from '~/composables/useTcgSearch'
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { deckPath, gameFromSlug, GAMES } from '#shared/game'
import { isTcgGame } from '#shared/tcg/types'
import { TCG_UI } from '~/utils/games/tcg'

// A generic-engine game's library (/pokemon…): every printing of the game,
// newest first. Reading only: a card opens its sheet, and can start a deck.
// Magic and One Piece have their own pages, which take their addresses first.
definePageMeta({ validate: route => isTcgGame(gameFromSlug(route.params.universe)) })

const route = useRoute()
const game = gameFromSlug(route.params.universe) as TcgGameId
const { t, locale } = useLocale()
const { createDeck } = useDeckStore()

usePublicSeo({
  title: () => `${GAMES[game].label} · ${t('tcg.library.title')}`,
  description: () => t(`${game}.library.sub`),
})

const { state, search, prime, loadMore, autocomplete } = useTcgSearch(game)
const filters = reactive<TcgFilters>(emptyTcgFilters())

function runSearch() {
  search(filters, locale.value)
}
let debounce: ReturnType<typeof setTimeout> | null = null
function onTextInput() {
  if (debounce)
    clearTimeout(debounce)
  debounce = setTimeout(runSearch, 280)
}
// The first page comes with the page, rendered by the server. The command
// palette opens a card here as ?q=.
const queryText = () => (typeof route.query.q === 'string' ? route.query.q : '')
filters.text = queryText()
const { data: firstPage } = await useAsyncData(
  `${game}-library-${locale.value}-${filters.text}`,
  () => $fetch<TcgBrowseResponse>(`/api/tcg/${game}/browse`, { params: tcgBrowseParams(filters, locale.value, 1, TCG_UI[game].uniqueSearch) }).catch(() => null),
)
prime(firstPage.value ?? null, filters, locale.value)
if (import.meta.server && !firstPage.value)
  setResponseStatus(useRequestEvent()!, 503)
watch(queryText, (q) => {
  filters.text = q
  runSearch()
})
watch(locale, runSearch)
onBeforeUnmount(() => debounce && clearTimeout(debounce))

const sheetOpen = ref(false)
const sheetCard = ref<TcgCard | null>(null)
function openCard(card: TcgCard) {
  sheetCard.value = card
  sheetOpen.value = true
}

function newDeck(card?: TcgCard) {
  const deck = createDeck({ name: card?.name || t('nav.newDeck'), game, raw: card ? `1 ${card.id}` : '' })
  navigateTo(deckPath(deck))
}
</script>

<template>
  <div class="library fade-up">
    <header class="head">
      <div class="min-w-0">
        <p class="kicker">
          {{ GAMES[game].label }}
        </p>
        <h1 class="title">
          {{ t('tcg.library.title') }}
        </h1>
        <p class="sub">
          {{ t(`${game}.library.sub`) }}
        </p>
      </div>
      <UButton color="primary" size="lg" :icon="GAMES[game].icon" @click="newDeck()">
        {{ t('tcg.library.newDeck') }}
      </UButton>
    </header>

    <div class="body">
      <aside class="rail">
        <TcgFilterRail
          v-model:filters="filters"
          :game="game"
          :lang="locale"
          :autocomplete="autocomplete"
          @change="runSearch"
          @text-input="onTextInput"
          @pick="openCard"
        />
      </aside>

      <section>
        <p class="meta">
          <span v-if="state.loading">{{ t('build.searching') }}</span>
          <span v-else>{{ state.total.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US') }} {{ t('tcg.results') }}</span>
        </p>
        <p v-if="state.failed" role="alert" class="empty">
          {{ t('tcg.searchFailed') }}
        </p>
        <p v-else-if="!state.loading && !state.cards.length" class="empty">
          {{ t('tcg.noResults') }}
        </p>
        <div class="grid">
          <TcgCardTile v-for="(card, i) in state.cards" :key="card.id" :game="game" :card="card" :index="i" @open="openCard" />
        </div>
        <div v-if="state.hasMore" class="more">
          <UButton color="neutral" variant="subtle" size="lg" :loading="state.loading" @click="loadMore">
            {{ t('tcg.loadMore') }}
          </UButton>
        </div>
      </section>
    </div>

    <TcgCardSheet v-model:open="sheetOpen" :game="game" :card="sheetCard" :lang="locale" @start="newDeck" />
  </div>
</template>

<style scoped>
.library {
  display: grid;
  gap: 22px;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.kicker {
  margin: 0;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--accent-text);
}
.title {
  margin: 2px 0 0;
  font-size: clamp(38px, 6vw, 64px);
  line-height: 0.95;
  color: var(--color-text-high);
}
.sub {
  max-width: 60ch;
  margin: 8px 0 0;
  color: var(--color-text-mid);
}
.body {
  display: grid;
  grid-template-columns: 290px 1fr;
  gap: 28px;
  align-items: start;
}
.rail {
  position: sticky;
  top: 76px;
  max-height: calc(100dvh - 96px);
  overflow-y: auto;
  padding: 16px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: var(--glass-bg);
}
.meta {
  margin: 0 0 14px;
  font-size: 12.5px;
  color: var(--color-text-muted);
}
.empty {
  padding: 60px 10px;
  text-align: center;
  color: var(--color-text-muted);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(170px, 42vw), 1fr));
  gap: 28px 20px;
}
.more {
  display: flex;
  justify-content: center;
  margin-top: 28px;
}
@media (max-width: 900px) {
  .body {
    grid-template-columns: 1fr;
  }
  .rail {
    position: static;
    max-height: none;
  }
}
</style>
