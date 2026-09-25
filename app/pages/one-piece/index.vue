<script setup lang="ts">
import type { OptcgCard } from '#shared/optcg/types'
import type { OptcgBrowseResponse, OptcgFilters } from '~/composables/useOptcgSearch'
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { deckPath } from '#shared/game'

// The One Piece library: every card of the game, pinned up as wanted posters.
// Reading only: a card opens its sheet; a Leader can start a deck.
definePageMeta({ universe: 'optcg' })

const { t, locale } = useLocale()
const { createDeck } = useDeckStore()

usePublicSeo({
  title: () => `One Piece · ${t('optcg.library.title')}`,
  description: () => t('optcg.library.sub'),
})

const { state, search, prime, loadMore, autocomplete } = useOptcgSearch()
const filters = reactive<OptcgFilters>(emptyOptcgFilters())
const ctx = () => ({ lang: locale.value, leaderColors: null })

function runSearch() {
  search(filters, ctx())
}
let debounce: ReturnType<typeof setTimeout> | null = null
function onTextInput() {
  if (debounce)
    clearTimeout(debounce)
  debounce = setTimeout(runSearch, 280)
}
// The first page comes with the page: rendered by the server, taken over as is
// by the browser. The command palette opens a card here as ?q=.
const route = useRoute()
const queryText = () => (typeof route.query.q === 'string' ? route.query.q : '')
filters.text = queryText()
const { data: firstPage } = await useAsyncData(
  `op-library-${locale.value}-${filters.text}`,
  () => $fetch<OptcgBrowseResponse>('/api/optcg/browse', { params: optcgBrowseParams(filters, ctx(), 1) }).catch(() => null),
)
prime(firstPage.value ?? null, filters, ctx())
// A failed first page is shown as such, but not handed to search engines.
if (import.meta.server && !firstPage.value)
  setResponseStatus(useRequestEvent()!, 503)
watch(queryText, (q) => {
  filters.text = q
  runSearch()
})
watch(locale, runSearch)
onBeforeUnmount(() => debounce && clearTimeout(debounce))

const sheetOpen = ref(false)
const sheetCard = ref<OptcgCard | null>(null)
function openCard(card: OptcgCard) {
  sheetCard.value = card
  sheetOpen.value = true
}

function newDeck(leader?: OptcgCard) {
  const art = leader && leader.id !== leader.number ? leader.id : leader?.number
  const deck = createDeck({
    name: leader ? `${t('optcg.library.newDeckName')} ${leader.name}` : t('nav.newDeck'),
    game: 'optcg',
    raw: leader ? `1x${art}` : '',
  })
  navigateTo(deckPath(deck))
}
</script>

<template>
  <div class="library fade-up">
    <header class="head">
      <div class="min-w-0">
        <p class="kicker">
          {{ t('optcg.name') }}
        </p>
        <h1 class="title">
          {{ t('optcg.library.title') }}
        </h1>
        <p class="sub">
          {{ t('optcg.library.sub') }}
        </p>
      </div>
      <UButton color="primary" size="lg" icon="i-lucide-anchor" @click="newDeck()">
        {{ t('optcg.library.newDeck') }}
      </UButton>
    </header>

    <div class="body">
      <aside class="rail">
        <OptcgFilterRail
          v-model:filters="filters"
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
          <span v-else>{{ state.total }} {{ t('optcg.results') }}</span>
        </p>
        <p v-if="state.failed" role="alert" class="empty">
          {{ t('optcg.searchFailed') }}
        </p>
        <p v-else-if="!state.loading && !state.cards.length" class="empty">
          {{ t('optcg.noResults') }}
        </p>
        <div class="grid">
          <OptcgWantedCard
            v-for="(card, i) in state.cards"
            :key="card.number"
            :card="card"
            :index="i"
            :lang="locale"
            @open="openCard"
          />
        </div>
        <div v-if="state.hasMore" class="more">
          <UButton color="neutral" variant="subtle" size="lg" :loading="state.loading" @click="loadMore">
            {{ t('optcg.loadMore') }}
          </UButton>
        </div>
      </section>
    </div>

    <OptcgCardSheet
      v-model:open="sheetOpen"
      :card="sheetCard"
      :lang="locale"
      @start="newDeck"
    />
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
  font-family: var(--font-sfx, var(--font-display));
  font-size: 15px;
  letter-spacing: 0.08em;
  color: var(--accent-text);
}
.title {
  margin: 2px 0 0;
  font-size: clamp(38px, 6vw, 64px);
  line-height: 0.95;
  color: var(--color-text-high);
  rotate: -1deg;
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
