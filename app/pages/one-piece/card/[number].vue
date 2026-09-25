<script setup lang="ts">
import type { OptcgCard, OptcgPrint } from '#shared/optcg/types'
import { computed, ref } from 'vue'
import { deckPath } from '#shared/game'

// One One Piece card, on its own page: rendered by the server so it can be
// found and shared. The same view as the library's sheet.
definePageMeta({ universe: 'optcg' })

const route = useRoute()
const { t, locale } = useLocale()
const { createDeck } = useDeckStore()

const number = computed(() => String(route.params.number).toUpperCase())
const lang = computed<'fr' | 'en'>(() => locale.value)

const { data, error } = await useAsyncData(
  () => `op-card-${number.value}-${lang.value}`,
  async () => {
    try {
      const [{ cards }, { prints }] = await Promise.all([
        $fetch<{ cards: (OptcgCard | null)[] }>('/api/optcg/resolve', {
          method: 'POST',
          body: { lang: lang.value, entries: [{ number: number.value }] },
        }),
        $fetch<{ prints: OptcgPrint[] }>('/api/optcg/prints', { params: { number: number.value, lang: lang.value } }),
      ])
      return { card: cards[0] ?? null, prints }
    }
    catch (err) {
      // A malformed number is refused by the route: the card does not exist.
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
  const colors = c.colors.map(col => t(`optcg.color.${col}`)).join(' / ')
  const head = `${c.name} (${c.number}), ${t(`optcg.category.${c.category}`)} ${colors}, One Piece Card Game.`
  const text = c.effect?.replace(/<[^>]+>|\[|\]/g, '').replace(/\s+/g, ' ').trim()
  return text ? `${head} ${text}`.slice(0, 200) : head
})

usePublicSeo({
  title: () => (card.value ? `${card.value.name} (${card.value.number}) · One Piece` : t('card.missing')),
  description,
  image: () => card.value?.image,
  type: 'article',
  noindex: () => !card.value,
})

function startWith(c: OptcgCard) {
  const art = c.id !== c.number ? c.id : c.number
  const deck = createDeck({ name: `${t('optcg.library.newDeckName')} ${c.name}`, game: 'optcg', raw: `1x${art}` })
  navigateTo(deckPath(deck))
}
</script>

<template>
  <div class="op-card fade-up">
    <nav class="crumbs">
      <NuxtLink to="/one-piece">
        <UIcon name="i-lucide-arrow-left" class="h-4 w-4" />
        {{ t('card.backToLibrary') }}
      </NuxtLink>
    </nav>

    <div v-if="!card" class="missing">
      <UIcon name="i-lucide-search-x" class="h-10 w-10" />
      <p>{{ t('card.missing') }}</p>
    </div>

    <article v-else class="sheet">
      <OptcgCardView v-model:shown="shown" :card="card" :prints="prints" :lang="lang" heading="h1">
        <template #actions="{ shownCard }">
          <footer class="actions">
            <UButton v-if="card.category === 'Leader'" color="primary" icon="i-lucide-anchor" @click="startWith(shownCard)">
              {{ t('optcg.library.startWith') }}
            </UButton>
            <UButton color="neutral" variant="subtle" icon="i-lucide-search" :to="`/one-piece?q=${encodeURIComponent(card.number)}`">
              {{ t('card.inLibrary') }}
            </UButton>
          </footer>
        </template>
      </OptcgCardView>
    </article>
  </div>
</template>

<style scoped>
.op-card {
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
.missing {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 0;
  color: var(--color-text-muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 4px;
}
</style>
