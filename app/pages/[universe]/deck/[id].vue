<script setup lang="ts">
import type { TcgLine } from '#shared/tcg/deck'
import type { TcgCard, TcgGameId } from '#shared/tcg/types'
import type { MissingItem } from '~/components/collection/MissingDialog.vue'
import type { TcgFilters } from '~/composables/useTcgSearch'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { isDefaultDeckName } from '#shared/decks'
import { collectionPath, deckPath, gameFromSlug, GAMES } from '#shared/game'
import { isTcgGame } from '#shared/tcg/types'
import { TCG_UI, tcgCover } from '~/utils/games/tcg'

// A generic-engine game's deckbuilder (/pokemon/deck/:id): the deck on the
// left, the search on the right, the game's rules checked on every edit.
// Same skeleton as the One Piece builder; no print, no buy, no coach.
definePageMeta({ pageTransition: false, validate: route => isTcgGame(gameFromSlug(route.params.universe)) })
useShowUniverseOnMount()

const route = useRoute()
const game = gameFromSlug(route.params.universe) as TcgGameId
const deckId = computed(() => String(route.params.id))
const { getDeck, ready: storeReady } = useDeckStore()
const { loggedIn } = useAuth()
const { t, locale, formatNumber } = useLocale()
const toast = useToast()
const { burst } = useUniverseFx()

const deck = computed(() => getDeck(deckId.value))
useSeoMeta({ title: () => deck.value?.name ?? GAMES[game].label })

const appFullscreen = useState('app-fullscreen', () => false)
onMounted(() => (appFullscreen.value = true))
onBeforeUnmount(() => (appFullscreen.value = false))

const lang = computed<'fr' | 'en'>(() => locale.value)
const raw = ref('')
const name = ref('')

// The builder's own writes are recognised by their content; any other change
// to the text (undo, import) reloads the builder from it.
let lastWritten: string | null = null
const tcgDeck = useTcgDeck({
  game,
  raw: {
    get: () => raw.value,
    set: (v) => {
      lastWritten = v
      raw.value = v
    },
  },
  lang,
})
watch(raw, (v) => {
  if (v === lastWritten) {
    lastWritten = null
    return
  }
  lastWritten = null
  tcgDeck.load()
})

// The deck against the member's collection, card by card (English name).
const nameOf = (card: TcgCard) => card.nameEn ?? card.name
const needs = computed(() => tcgDeck.lines.value.flatMap(l => (l.card ? [{ name: nameOf(l.card), quantity: l.entry.quantity }] : [])))
const ownership = useDeckOwnership(game, needs)
const ownedOf = (line: TcgLine) => (line.card ? ownership.ownedOf(nameOf(line.card)) : null)
// What the collection lacks of the deck, for "Il me manque".
const showMissing = ref(false)
const missingItems = computed<MissingItem[]>(() => ownership.keepMissing(
  tcgDeck.lines.value.filter((l): l is TcgLine & { card: TcgCard } => !!l.card),
  l => nameOf(l.card),
  l => l.entry.quantity,
  (l, quantity) => ({ ...l, entry: { ...l.entry, quantity } }),
).map(l => ({ key: l.card.id, name: l.card.name, image: l.card.thumb || l.card.image, quantity: l.entry.quantity, price: l.card.price, printingId: `${l.card.lang}:${l.card.id}` })))

const autosave = useDeckAutosave({ deckId, raw, name })
watch([raw, name], autosave.schedule)

function init(id: string) {
  const d = getDeck(id)
  if (!d) {
    if (storeReady.value)
      navigateTo('/decks')
    return
  }
  if (d.game !== game) {
    navigateTo(deckPath(d), { replace: true })
    return
  }
  autosave.reset({ raw: d.raw, name: d.name })
  raw.value = d.raw
  name.value = d.name
  tcgDeck.load()
}
watch([deckId, storeReady], ([id]) => init(id), { immediate: true })
watch(() => getDeck(deckId.value), (now, before) => {
  if (!now && before && storeReady.value)
    navigateTo('/decks')
})

// A deck without a name of its own takes its cover card's.
const cover = computed(() => tcgCover(game, tcgDeck.lines.value))
watch(() => cover.value?.card?.name, (star) => {
  if (star && isDefaultDeckName(name.value))
    name.value = star
})

// ---- Search: it follows the deck's format ----
const { state, search, loadMore, autocomplete } = useTcgSearch(game)
const filters = reactive<TcgFilters>({ ...emptyTcgFilters(), format: tcgDeck.format.value })
function runSearch() {
  search(filters, lang.value)
}
watch(tcgDeck.format, (f) => {
  filters.format = f
  runSearch()
})
let debounce: ReturnType<typeof setTimeout> | null = null
function onTextInput() {
  if (debounce)
    clearTimeout(debounce)
  debounce = setTimeout(runSearch, 280)
}
watch(lang, runSearch, { immediate: true })
onBeforeUnmount(() => debounce && clearTimeout(debounce))

// ---- Adding cards ----
function add(card: TcgCard, from?: HTMLElement | null, zone?: string) {
  const result = tcgDeck.add(card, zone)
  if (!result.ok) {
    toast.add({ title: t(`tcg.add.${result.reason}`), color: 'warning', icon: 'i-lucide-ban' })
    return
  }
  burst(from ?? null, t('tcg.add.sfx'), game)
}

// ---- Card sheet ----
const sheetOpen = ref(false)
const sheetCard = ref<TcgCard | null>(null)
const sheetLine = ref<TcgLine | null>(null)
function openCard(card: TcgCard) {
  sheetCard.value = card
  sheetLine.value = tcgDeck.lines.value.find(l => l.entry.name === card.id) ?? null
  sheetOpen.value = true
}
function openLine(line: TcgLine) {
  if (!line.card)
    return
  sheetCard.value = line.card
  sheetLine.value = line
  sheetOpen.value = true
}
function removeOne(card: TcgCard) {
  const line = sheetLine.value ?? tcgDeck.lines.value.find(l => l.card && nameOf(l.card) === nameOf(card))
  if (line)
    tcgDeck.setQuantity(line.entry, line.entry.quantity - 1)
}
function setPrinting(card: TcgCard) {
  if (sheetLine.value)
    tcgDeck.setPrinting(sheetLine.value.entry, card)
  sheetOpen.value = false
}

// ---- Import / export: the shell's dialog, this deck as its target ----
const importOverlay = useImportOverlay()
onMounted(() => importOverlay.registerTarget({
  game,
  name: () => name.value,
  read: () => raw.value,
  write: (list) => { raw.value = list },
}))
onBeforeUnmount(() => importOverlay.clearTarget())

// ---- Share, save ----
const showShare = ref(false)
const showWall = ref(false)
const dots = computed(() => {
  const types = new Map<string, number>()
  for (const l of tcgDeck.lines.value) {
    for (const ty of l.card?.types ?? [])
      types.set(ty, (types.get(ty) ?? 0) + l.entry.quantity)
  }
  return [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ty]) => TCG_UI[game].typeColor[ty] ?? '#999')
})
const summary = computed(() => `${tcgDeck.count.value} ${t('dash.cards')}`)
const format = computed({ get: () => tcgDeck.format.value, set: tcgDeck.setFormat })
</script>

<template>
  <div v-if="deck" class="tcg-deck fade-up">
    <BuilderDeckToolbar
      v-model:deck-name="name"
      :dots="dots"
      :card-count="tcgDeck.count.value"
      :owned="ownership.summary.value"
      :collection-to="collectionPath(game)"
      :logged-in="loggedIn"
      :can-undo="autosave.canUndo.value"
      :can-redo="autosave.canRedo.value"
      @open-import-export="importOverlay.show({ fromTarget: true })"
      @share="showShare = true"
      @save="showWall = true"
      @undo="autosave.undo"
      @redo="autosave.redo"
      @open-missing="showMissing = true"
    />

    <div class="workspace">
      <TcgDeckPanel
        v-model:format="format"
        class="ws-deck"
        :game="game"
        :lines="tcgDeck.lines.value"
        :validation="tcgDeck.validation.value"
        :resolving="tcgDeck.resolving.value"
        :unknown="tcgDeck.unknown.value"
        :unreadable="tcgDeck.unreadable.value"
        :lang="lang"
        :owned-of="ownedOf"
        @set-quantity="tcgDeck.setQuantity"
        @open="openLine"
      />

      <section class="ws-search">
        <TcgFilterRail
          v-model:filters="filters"
          class="ws-rail"
          :game="game"
          :lang="lang"
          :autocomplete="autocomplete"
          @change="runSearch"
          @text-input="onTextInput"
          @pick="openCard"
        />

        <div class="ws-results">
          <p class="meta">
            <span v-if="state.loading">{{ t('build.searching') }}</span>
            <span v-else>{{ formatNumber(state.total) }} {{ t('tcg.results') }}</span>
          </p>
          <p v-if="state.failed" role="alert" class="empty">
            {{ t('tcg.searchFailed') }}
          </p>
          <p v-else-if="!state.loading && !state.cards.length" class="empty">
            {{ t('tcg.noResults') }}
          </p>
          <div class="grid">
            <TcgCardTile
              v-for="(card, i) in state.cards"
              :key="card.id"
              :game="game"
              :card="card"
              :index="i"
              :quantity="tcgDeck.quantityOf(card)"
              addable
              @open="openCard"
              @add="add"
            />
          </div>
          <div v-if="state.hasMore" class="more">
            <UButton color="neutral" variant="subtle" :loading="state.loading" @click="loadMore">
              {{ t('tcg.loadMore') }}
            </UButton>
          </div>
        </div>
      </section>
    </div>

    <TcgCardSheet
      v-model:open="sheetOpen"
      :game="game"
      :card="sheetCard"
      :lang="lang"
      :quantity="sheetCard ? tcgDeck.quantityOf(sheetCard) : 0"
      :line-printing="sheetLine?.entry.name ?? null"
      @add="add"
      @remove="removeOne"
      @set-printing="setPrinting"
    />

    <CollectionMissingDialog v-model:open="showMissing" :game="game" :items="missingItems" />
    <DeckShareModal v-model:open="showShare" :deck="deck" />
    <DeckSaveWall v-model:open="showWall" :deck-name="name" :summary="summary" :universe="game" />
  </div>
</template>

<style scoped>
.tcg-deck {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.workspace {
  flex: 1;
  display: grid;
  gap: 20px;
  min-height: 0;
  grid-template-columns: minmax(300px, 400px) 1fr;
}
.ws-deck,
.ws-search,
.ws-results {
  min-width: 0;
}
.ws-deck {
  min-height: 0;
}
.ws-search {
  display: grid;
  grid-template-columns: 270px 1fr;
  gap: 18px;
  min-height: 0;
}
.ws-rail {
  align-self: start;
  max-height: 100%;
  overflow-y: auto;
  padding-right: 4px;
}
.ws-results {
  min-height: 0;
  overflow-y: auto;
  padding: 6px 10px 20px 4px;
}
.meta {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--color-text-muted);
}
.empty {
  padding: 40px 10px;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-muted);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(150px, 40vw), 1fr));
  gap: 22px 16px;
}
.more {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
@media (max-width: 1279px) {
  .ws-search {
    grid-template-columns: 1fr;
  }
  .ws-rail {
    max-height: none;
    overflow: visible;
  }
}
@media (max-width: 1023px) {
  .tcg-deck {
    display: block;
  }
  .workspace {
    grid-template-columns: 1fr;
  }
  .ws-results {
    overflow: visible;
  }
}
</style>
