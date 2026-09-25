<script setup lang="ts">
import type { GameId } from '#shared/game'
import type { OptcgDeckLine } from '#shared/optcg/deck'
import type { OptcgCard } from '#shared/optcg/types'
import { computed, onMounted, ref, watch } from 'vue'
import { deckPath, sharedPath } from '#shared/game'

// A shared One Piece deck, read-only, by day. The same deck panel as the
// builder without its steppers, and the fifty cards pinned as posters. A
// visitor can take a copy: it lands among their decks, account or not.
definePageMeta({ universe: 'optcg' })

interface SharedDeck { name: string, game: GameId, raw: string, source?: string | null, public: boolean }

const route = useRoute()
const shareId = computed(() => String(route.params.shareId))
const { t, locale } = useLocale()
const { createDeck } = useDeckStore()

// The deck comes with the page; its cards resolve in the browser.
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

if (deck.value && deck.value.game !== 'optcg')
  await navigateTo(sharedPath(deck.value.game, shareId.value), { replace: true, redirectCode: 301 })
if (import.meta.server && !deck.value)
  setResponseStatus(useRequestEvent()!, 404)

const lang = computed<'fr' | 'en'>(() => locale.value)
const optDeck = useOptcgDeck({
  raw: { get: () => deck.value?.raw ?? '', set: () => {} },
  lang,
})
onMounted(() => watch(() => deck.value?.raw, () => optDeck.load(), { immediate: true }))

// Only decks listed in Discover are meant to be found; a link stays a link.
usePublicSeo({
  title: () => (deck.value ? `${deck.value.name} · ${t('share.sharedDeck')}` : t('share.notFound')),
  description: () => t('share.metaOp'),
  noindex: () => !deck.value?.public,
})

/** Each card once, with its copies, cheapest first as a player reads a list. */
const posters = computed(() => {
  const leader = optDeck.leader.value
  return optDeck.lines.value
    .filter((l): l is OptcgDeckLine & { card: OptcgCard } => l !== leader && !!l.card)
    .sort((a, b) => (a.card.cost ?? 99) - (b.card.cost ?? 99) || a.card.number.localeCompare(b.card.number))
})

const sheetOpen = ref(false)
const sheetCard = ref<OptcgCard | null>(null)
const sheetArt = ref<string | null>(null)
function openLine(line: OptcgDeckLine) {
  if (!line.card)
    return
  sheetCard.value = line.card
  sheetArt.value = line.entry.art ?? null
  sheetOpen.value = true
}

function copyToMine() {
  if (!deck.value)
    return
  const copy = createDeck({ name: deck.value.name, game: 'optcg', raw: deck.value.raw })
  navigateTo(deckPath(copy))
}

// From the sheet, a Leader can start a fresh deck of the visitor's own.
function startWith(card: OptcgCard) {
  const art = card.id !== card.number ? card.id : card.number
  const fresh = createDeck({ name: `${t('optcg.library.newDeckName')} ${card.name}`, game: 'optcg', raw: `1x${art}` })
  navigateTo(deckPath(fresh))
}
</script>

<template>
  <div class="op-shared fade-up">
    <div v-if="loading" class="state">
      <UIcon name="i-lucide-loader-circle" class="h-8 w-8 animate-spin text-(--accent-text)" />
    </div>

    <div v-else-if="notFound || !deck" class="state">
      <UIcon name="i-lucide-unlink" class="h-10 w-10 text-(--color-text-muted)" />
      <p class="text-(--color-text-muted)">
        {{ t('share.notFound') }}
      </p>
      <UButton to="/one-piece" color="primary" icon="i-lucide-anchor">
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
        <OptcgDeckPanel
          class="panel"
          readonly
          :lines="optDeck.lines.value"
          :leader="optDeck.leader.value"
          :validation="optDeck.validation.value"
          :stats="optDeck.stats.value"
          :resolving="optDeck.resolving.value"
          :unknown="optDeck.unknown.value"
          :unreadable="optDeck.unreadable.value"
          :lang="lang"
          @open="openLine"
        />
        <div class="grid">
          <OptcgWantedCard
            v-for="(line, i) in posters"
            :key="`${line.entry.name}|${line.entry.art ?? ''}`"
            :card="line.card"
            :index="i"
            :lang="lang"
            :quantity="line.entry.quantity"
            @open="openLine(line)"
          />
        </div>
      </div>

      <OptcgCardSheet
        v-model:open="sheetOpen"
        :card="sheetCard"
        :lang="lang"
        :line-art="sheetArt"
        @start="startWith"
      />
    </template>
  </div>
</template>

<style scoped>
.op-shared {
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
