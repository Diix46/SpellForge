<script setup lang="ts">
import type { SearchResponse } from '~/composables/useCardSearch'
import type { ResolvedCard, ScryfallCard } from '~/composables/useScryfall'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { deckPath } from '#shared/game'
import { browseParams, emptyFilters, useCardSearch } from '~/composables/useCardSearch'
import { toMtgCard } from '~/composables/useScryfall'

// The Magic library: every Commander-legal card, as pages of a grimoire.
// Reading only: a card opens its sheet; a possible commander can start a deck.
definePageMeta({ universe: 'mtg', colorMode: 'dark' })

const { t, locale } = useLocale()
const { createDeck } = useDeckStore()

usePublicSeo({
  title: () => `Magic · ${t('mtg.library.title')}`,
  description: () => t('mtg.library.sub'),
})

const { state, search, prime, loadMore, autocomplete } = useCardSearch()
const filters = reactive(emptyFilters())
const ctx = computed(() => ({ identity: null, lang: locale.value }))

function runSearch() {
  search(filters, ctx.value)
}
let debounce: ReturnType<typeof setTimeout> | null = null
function onTextInput() {
  if (debounce)
    clearTimeout(debounce)
  debounce = setTimeout(runSearch, 320)
}
// The first page comes with the page: rendered by the server, taken over as is
// by the browser. The command palette opens a card here as ?q=.
const route = useRoute()
const queryText = () => (typeof route.query.q === 'string' ? route.query.q : '')
filters.text = queryText()
const { data: firstPage } = await useAsyncData(
  `mtg-library-${locale.value}-${filters.text}`,
  () => $fetch<SearchResponse>('/api/cards/browse', { params: browseParams(filters, ctx.value, 1) }).catch(() => null),
)
prime(firstPage.value ?? null, filters, ctx.value)
// A failed first page is shown as such, but not handed to search engines.
if (import.meta.server && !firstPage.value)
  setResponseStatus(useRequestEvent()!, 503)
watch(queryText, (q) => {
  filters.text = q
  runSearch()
})
watch(locale, runSearch)
onBeforeUnmount(() => debounce && clearTimeout(debounce))

const detailOpen = ref(false)
const detail = ref<ResolvedCard | null>(null)
function openCard(c: ScryfallCard) {
  detail.value = {
    entry: { quantity: 1, name: c.name },
    card: toMtgCard(c),
    imageUrl: c.image_uris?.large ?? c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.large ?? c.card_faces?.[0]?.image_uris?.normal ?? null,
    backImageUrl: c.card_faces?.[1]?.image_uris?.large ?? c.card_faces?.[1]?.image_uris?.normal ?? null,
    lang: c.lang,
    priceEur: c.prices?.eur ?? null,
  }
  detailOpen.value = true
}

function newDeck(commander?: ResolvedCard) {
  const name = commander?.card?.name
  const deck = createDeck({
    name: name ? `${t('mtg.library.newDeckName')} ${name}` : t('nav.newDeck'),
    game: 'mtg',
    raw: name ? `1 ${name}` : '',
  })
  navigateTo(deckPath(deck))
}
</script>

<template>
  <div class="library fade-up">
    <header class="head">
      <div class="min-w-0">
        <p class="kicker">
          {{ t('mtg.name') }}
        </p>
        <h1 class="title">
          {{ t('mtg.library.title') }}
        </h1>
        <p class="sub u-prose">
          {{ t('mtg.library.sub') }}
        </p>
      </div>
      <UButton color="primary" size="lg" icon="i-lucide-book-open" @click="newDeck()">
        {{ t('mtg.library.newDeck') }}
      </UButton>
    </header>

    <div class="body">
      <aside class="rail">
        <BuilderSearchFilters
          v-model:filters="filters"
          :identity="null"
          :suggest-mode="false"
          :autocomplete="autocomplete"
          @change="runSearch"
          @text-input="onTextInput"
        />
      </aside>

      <section>
        <p class="meta">
          <span v-if="state.loading">{{ t('build.searching') }}</span>
          <span v-else>{{ state.total }} {{ t('build.results') }}</span>
        </p>
        <p v-if="state.error && !state.loading" role="alert" class="empty">
          {{ state.error }}
        </p>
        <p v-else-if="!state.loading && !state.cards.length" class="empty">
          {{ t('build.noResults') }}
        </p>
        <div class="grid">
          <MtgGrimoireCard v-for="card in state.cards" :key="card.id" :card="card" @open="openCard" />
        </div>
        <div v-if="state.hasMore" class="more">
          <UButton color="neutral" variant="subtle" size="lg" :loading="state.loading" @click="loadMore">
            {{ t('build.loadMore') }}
          </UButton>
        </div>
      </section>
    </div>

    <CardDetailModal
      v-model:open="detailOpen"
      :card="detail"
      library
      @set-commander="newDeck"
    />
  </div>
</template>

<style scoped>
.library {
  display: grid;
  gap: 26px;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--color-border-subtle);
}
.kicker {
  margin: 0;
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--accent-text);
}
.title {
  margin: 4px 0 0;
  font-size: clamp(34px, 5vw, 56px);
  line-height: 1;
  color: var(--color-text-high);
}
.sub {
  max-width: 62ch;
  margin: 10px 0 0;
  font-style: italic;
  color: var(--color-text-mid);
}
.body {
  display: grid;
  grid-template-columns: 290px 1fr;
  gap: 30px;
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
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 22px;
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
