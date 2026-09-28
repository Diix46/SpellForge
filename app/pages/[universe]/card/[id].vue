<script setup lang="ts">
import type { TcgCard, TcgGameId } from '#shared/tcg/types'
import { computed, ref } from 'vue'
import { deckPath, gameFromSlug, GAMES, libraryPath } from '#shared/game'
import { TCG_RULES } from '#shared/tcg/rules'
import { isTcgGame } from '#shared/tcg/types'
import { cardmarketSearch } from '~/composables/useCardmarket'
import { tcgLabel } from '~/utils/games/tcg'
import { decodeEntities } from '~/utils/tcg/richText'

// One printing of a generic-engine game, on its own page (/pokemon/card/sv03.5-006):
// rendered by the server so it can be found and shared. The library sheet's view.
definePageMeta({ validate: route => isTcgGame(gameFromSlug(route.params.universe)) })

const route = useRoute()
const game = gameFromSlug(route.params.universe) as TcgGameId
const { t, locale } = useLocale()
const { createDeck } = useDeckStore()

const id = computed(() => String(route.params.id))
const lang = computed<'fr' | 'en'>(() => locale.value)

const { data, error } = await useAsyncData(
  () => `${game}-card-${id.value}-${lang.value}`,
  async () => {
    try {
      const [{ cards }, { prints }] = await Promise.all([
        $fetch<{ cards: (TcgCard | null)[] }>(`/api/tcg/${game}/resolve`, { method: 'POST', body: { lang: lang.value, ids: [id.value] } }),
        $fetch<{ prints: TcgCard[] }>(`/api/tcg/${game}/prints`, { params: { id: id.value, lang: lang.value } }),
      ])
      return { card: cards[0] ?? null, prints }
    }
    catch (err) {
      // A malformed id is refused by the route: the card does not exist.
      if (fetchStatus(err) === 400)
        return { card: null, prints: [] }
      throw err
    }
  },
  { watch: [lang] },
)
if (error.value)
  unavailable(error.value)

const card = computed(() => data.value?.card ?? null)
const prints = computed(() => data.value?.prints ?? [])
const shown = ref<string | null>(null)

if (import.meta.server && !card.value)
  setResponseStatus(useRequestEvent()!, 404)

const description = computed(() => {
  const c = card.value
  if (!c)
    return t('card.missing')
  const head = `${c.name} (${c.setName ?? c.set} ${c.number}), ${tcgLabel(t, game, 'category', c.category)}, ${GAMES[game].label}.`
  // Words only: the symbols are pictures on the page.
  const text = c.text && decodeEntities(c.text).replace(/:rb_[a-z0-9_]+:/g, '').replace(/\s+/g, ' ').trim()
  return text ? `${head} ${text}`.slice(0, 200) : head
})

usePublicSeo({
  title: () => (card.value ? `${card.value.name} (${card.value.set} ${card.value.number}) · ${GAMES[game].label}` : t('card.missing')),
  description,
  image: () => card.value?.image,
  type: 'article',
  noindex: () => !card.value,
})

function startWith(c: TcgCard) {
  const deck = createDeck({ name: c.name, game, raw: `1 ${c.id}` })
  navigateTo(deckPath(deck))
}
</script>

<template>
  <div class="tcg-card fade-up">
    <nav class="crumbs">
      <NuxtLink :to="libraryPath(game)">
        <UIcon name="i-lucide-arrow-left" class="h-4 w-4" />
        {{ t('card.backToLibrary') }}
      </NuxtLink>
    </nav>

    <ErrorPanel v-if="!card" :title="t('card.missing')" />

    <article v-else class="sheet">
      <TcgCardView v-model:shown="shown" :game="game" :card="card" :prints="prints" :lang="lang" heading="h1">
        <template #actions="{ shownCard }">
          <footer class="actions">
            <UButton color="primary" :icon="GAMES[game].icon" @click="startWith(shownCard)">
              {{ t('tcg.startWith') }}
            </UButton>
            <CardAddToDeck :game="game" :card-key="shownCard.id" :zone="TCG_RULES[game].zoneFor(shownCard)" />
            <UButton color="neutral" variant="subtle" icon="i-lucide-search" :to="`${libraryPath(game)}?q=${encodeURIComponent(card.name)}`">
              {{ t('card.inLibrary') }}
            </UButton>
            <UButton color="neutral" variant="ghost" icon="i-lucide-shopping-cart" :to="cardmarketSearch(game, shownCard.nameEn ?? shownCard.name, locale)" target="_blank">
              {{ t('card.cardmarket') }}
            </UButton>
          </footer>
        </template>
      </TcgCardView>
    </article>
  </div>
</template>

<style scoped>
.tcg-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 980px;
  margin: 0 auto;
}
.crumbs a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-muted);
}
.crumbs a:hover {
  color: var(--color-text-high);
}
.sheet {
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: var(--glass-bg);
  box-shadow: var(--shadow-elev-1);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 4px;
}
</style>
