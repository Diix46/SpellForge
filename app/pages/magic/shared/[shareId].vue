<script setup lang="ts">
import type { GameId } from '#shared/game'
import type { ResolvedCard } from '~/composables/useScryfall'
import { computed, onMounted, ref, watch } from 'vue'
import { deckPath, sharedPath } from '#shared/game'
import { useDeckAnalysis } from '~/composables/useDeckAnalysis'
import { useDecklist } from '~/composables/useDecklist'
import { useManaIdentity } from '~/composables/useManaIdentity'
import { useScryfall } from '~/composables/useScryfall'

// A shared Magic deck, read-only, at night like the rest of Magic.
definePageMeta({ universe: 'mtg', colorMode: 'dark' })

const route = useRoute()
const shareId = computed(() => route.params.shareId as string)
const { createDeck } = useDeckStore()

const { locale, t } = useLocale()
const { parse, totalCards } = useDecklist()
const { fetchCollection } = useScryfall()
const { typeStats, detectCommanderIndex, commanderColors } = useDeckAnalysis()
const { colorVar } = useManaIdentity()

interface SharedDeck { name: string, game: GameId, raw: string, source?: string | null, public: boolean }

// The deck comes with the page; its cards resolve in the browser.
const { data, status } = await useAsyncData(
  () => `shared-${shareId.value}`,
  () => $fetch<{ deck: SharedDeck }>(`/api/shared/${encodeURIComponent(shareId.value)}`).then(r => r.deck).catch(() => null),
)
const deck = computed(() => data.value ?? null)
const notFound = computed(() => status.value !== 'pending' && !deck.value)
const resolved = ref<ResolvedCard[]>([])
const loading = computed(() => status.value === 'pending')

if (deck.value && deck.value.game !== 'mtg')
  await navigateTo(sharedPath(deck.value.game, shareId.value), { replace: true, redirectCode: 301 })
if (import.meta.server && !deck.value)
  setResponseStatus(useRequestEvent()!, 404)

const cardCount = computed(() => {
  if (!deck.value)
    return 0
  const p = parse(deck.value.raw)
  return totalCards(p.mainboard) + totalCards(p.sideboard)
})
const stats = computed(() => typeStats(resolved.value))
const commander = computed(() => {
  const i = detectCommanderIndex(resolved.value)
  return i >= 0 ? resolved.value[i] : null
})
const { themeColors, themeStyle } = useDeckTheme(() => commander.value?.card ? commanderColors(commander.value.card) : [])
// Read-only: never the commander, just all cards.
const gridCards = computed(() => resolved.value.filter(c => c.imageUrl))

// Only decks listed in Discover are meant to be found; a link stays a link.
usePublicSeo({
  title: () => (deck.value ? `${deck.value.name} · ${t('share.sharedDeck')}` : t('share.notFound')),
  description: () => t('share.metaMtg'),
  noindex: () => !deck.value?.public,
})

onMounted(() => watch([() => deck.value?.raw, locale], async ([raw, lang]) => {
  if (raw == null)
    return
  const { mainboard, sideboard } = parse(raw)
  resolved.value = await fetchCollection([...mainboard, ...sideboard], lang)
}, { immediate: true }))

// The visitor keeps a copy among their own decks, account or not.
function copyToMine() {
  if (!deck.value)
    return
  const copy = createDeck({ name: deck.value.name, game: 'mtg', raw: deck.value.raw, source: deck.value.source ?? undefined })
  navigateTo(deckPath(copy))
}
</script>

<template>
  <div class="fade-up" :style="themeStyle">
    <!-- Loading -->
    <div v-if="loading" class="glass mx-auto flex max-w-md flex-col items-center rounded-[var(--radius-2xl)] py-16 text-center">
      <UIcon name="i-lucide-loader-circle" class="mb-3 h-10 w-10 animate-spin text-(--accent-text)" />
    </div>

    <!-- Not found -->
    <div v-else-if="notFound || !deck" class="glass mx-auto flex max-w-md flex-col items-center gap-4 rounded-[var(--radius-2xl)] py-16 text-center">
      <UIcon name="i-lucide-unlink" class="h-12 w-12 text-(--color-text-muted)" />
      <p class="text-(--color-text-muted)">
        {{ t('share.notFound') }}
      </p>
      <UButton to="/magic" color="primary" icon="i-lucide-book-open">
        {{ t('share.home') }}
      </UButton>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <div class="mb-1 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[2px] text-(--accent-text)">
            <UIcon name="i-lucide-share-2" class="h-3.5 w-3.5" />
            {{ t('share.sharedDeck') }} · {{ t('share.viewOnly') }}
          </div>
          <h1 class="truncate font-display text-2xl font-bold text-(--color-text-high) md:text-3xl">
            {{ deck.name }}
          </h1>
          <div class="mt-1 flex items-center gap-1.5">
            <span
              v-for="c in themeColors"
              :key="c"
              class="h-2.5 w-2.5 rounded-full"
              :style="{ background: colorVar(c), boxShadow: `0 0 6px ${colorVar(c)}` }"
            />
            <span class="ml-1 font-mono text-xs text-(--color-text-muted)">{{ cardCount }} {{ t('editor.cardsWord') }}</span>
          </div>
        </div>
        <UButton color="primary" icon="i-lucide-copy-plus" class="shrink-0" @click="copyToMine">
          {{ t('share.copyToMine') }}
        </UButton>
      </div>

      <!-- Stats -->
      <div v-if="stats.length" class="glass-solid mb-6 rounded-[var(--radius-xl)] p-4">
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div
            v-for="s in stats"
            :key="s.key"
            class="flex items-center gap-2 rounded-[var(--radius-md)] bg-(--color-surface-2)/50 px-3 py-2"
          >
            <UIcon :name="s.icon" class="h-4 w-4 text-(--color-text-muted)" />
            <div class="min-w-0">
              <div class="font-mono text-sm font-semibold text-(--color-text-high)">
                {{ s.count }}
              </div>
              <div class="truncate text-[10px] text-(--color-text-muted)">
                {{ t(`type.${s.key}`) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Card grid (read-only) -->
      <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        <img
          v-for="card in gridCards"
          :key="card.card?.id ?? card.entry.name"
          :src="card.imageUrl!"
          :alt="card.card?.name ?? card.entry.name"
          loading="lazy"
          class="block aspect-[63/88] w-full rounded-[var(--radius-md)] object-cover ring-1 ring-(--color-border-subtle)"
        >
      </div>
    </template>
  </div>
</template>
