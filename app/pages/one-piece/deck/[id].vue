<script setup lang="ts">
import type { OptcgDeckLine } from '#shared/optcg/deck'
import type { OptcgCategory } from '#shared/optcg/rules'
import type { OptcgCard } from '#shared/optcg/types'
import type { OptcgFilters } from '~/composables/useOptcgSearch'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { deckPath } from '#shared/game'
import { OPTCG_COLOR_HEX } from '~/utils/optcgColors'

// The One Piece deckbuilder. Broad daylight: the page forces light mode and
// the One Piece universe. Same page skeleton as Magic (toolbar, deck on the
// left, search on the right), with its own rules, filters and posters. No
// print, no buy, no coach: those are Magic-only (shared/game.ts).
definePageMeta({ pageTransition: false, universe: 'optcg', colorMode: 'light' })

const route = useRoute()
const deckId = computed(() => String(route.params.id))
const { getDeck, ready: storeReady } = useDeckStore()
const { loggedIn } = useAuth()
const { t, locale } = useLocale()
const toast = useToast()
const { burst } = useUniverseFx()

const deck = computed(() => getDeck(deckId.value))
useSeoMeta({ title: () => deck.value?.name ?? 'One Piece' })

// Viewport-locked shell, as on the Magic deck page.
const appFullscreen = useState('app-fullscreen', () => false)
onMounted(() => (appFullscreen.value = true))
onBeforeUnmount(() => (appFullscreen.value = false))

const lang = computed<'fr' | 'en'>(() => locale.value)
const raw = ref('')
const name = ref('')

// Edits from the builder write the text; any other change to the text (undo,
// import) reloads the builder from it. The builder's own write is recognised
// by its content: writing the same text twice changes nothing and must not
// leave a stale flag behind.
let lastWritten: string | null = null
const optDeck = useOptcgDeck({
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
  optDeck.load()
})

const autosave = useDeckAutosave({ deckId, raw, name })
watch([raw, name], autosave.schedule)

function init(id: string) {
  const d = getDeck(id)
  if (!d) {
    if (storeReady.value)
      navigateTo('/decks')
    return
  }
  if (d.game !== 'optcg') {
    navigateTo(deckPath(d), { replace: true })
    return
  }
  autosave.reset({ raw: d.raw, name: d.name })
  raw.value = d.raw
  name.value = d.name
  optDeck.load()
}
watch([deckId, storeReady], ([id]) => init(id), { immediate: true })

// Signing out, or deleting the deck in another tab, takes it away: back to the list.
watch(() => getDeck(deckId.value), (now, before) => {
  if (!now && before && storeReady.value)
    navigateTo('/decks')
})

// ---- Search ----
const { state, search, loadMore, autocomplete } = useOptcgSearch()
const filters = reactive<OptcgFilters>({ ...emptyOptcgFilters(), legalOnly: true })
const leaderColors = computed(() => optDeck.leader.value?.card?.colors ?? null)
// Without a Leader the first job is to pick one: the search shows Leaders only.
const categories = computed<OptcgCategory[]>(() => (optDeck.leader.value?.card ? ['Character', 'Event', 'Stage'] : ['Leader']))
const ctx = computed(() => ({ lang: lang.value, leaderColors: leaderColors.value }))

function runSearch() {
  const allowed = categories.value
  if (allowed.length === 1)
    filters.category = allowed[0]!
  else if (filters.category && !allowed.includes(filters.category))
    filters.category = ''
  search(filters, ctx.value)
}
let debounce: ReturnType<typeof setTimeout> | null = null
function onTextInput() {
  if (debounce)
    clearTimeout(debounce)
  debounce = setTimeout(runSearch, 280)
}
watch(() => [ctx.value.lang, ctx.value.leaderColors?.join(',')], runSearch, { immediate: true })
onBeforeUnmount(() => debounce && clearTimeout(debounce))

// ---- Adding cards ----
function add(card: OptcgCard, from?: HTMLElement | null, pinArt = false) {
  const result = optDeck.add(card, pinArt)
  if (!result.ok) {
    toast.add({ title: t(`optcg.add.${result.reason}`), color: 'warning', icon: 'i-lucide-ban' })
    return
  }
  burst(from ?? null, t('optcg.add.sfx'), 'optcg')
  if (result.asLeader)
    toast.add({ title: t('optcg.add.leader'), description: card.name, color: 'success', icon: 'i-lucide-crown' })
}

// ---- Card sheet ----
const sheetOpen = ref(false)
const sheetCard = ref<OptcgCard | null>(null)
const sheetLine = ref<OptcgDeckLine | null>(null)
function openCard(card: OptcgCard) {
  sheetCard.value = card
  sheetLine.value = optDeck.lines.value.find(l => l.entry.name === card.number) ?? null
  sheetOpen.value = true
}
function openLine(line: OptcgDeckLine) {
  if (!line.card)
    return
  sheetCard.value = line.card
  sheetLine.value = line
  sheetOpen.value = true
}
function removeOne(card: OptcgCard) {
  const line = sheetLine.value ?? optDeck.lines.value.find(l => l.entry.name === card.number)
  if (line)
    optDeck.setQuantity(line.entry, line.entry.quantity - 1)
}
function setArt(card: OptcgCard) {
  if (sheetLine.value)
    optDeck.setArt(sheetLine.value.entry, card)
  sheetOpen.value = false
}

// ---- Import / export (text only: One Piece cards are never printed) ----
const showText = ref(false)
const textDraft = ref('')
function openText() {
  textDraft.value = raw.value
  showText.value = true
}
function applyText() {
  raw.value = textDraft.value
  showText.value = false
}
async function copyText() {
  try {
    await navigator.clipboard.writeText(raw.value)
    toast.add({ title: t('toast.listCopied'), color: 'success', icon: 'i-lucide-clipboard-check' })
  }
  catch {
    toast.add({ title: t('toast.copyError'), color: 'error', icon: 'i-lucide-x' })
  }
}

// ---- Share, save ----
const showShare = ref(false)
const showWall = ref(false)
const dots = computed(() => (leaderColors.value ?? []).map(c => OPTCG_COLOR_HEX[c]))
const summary = computed(() => {
  const leader = optDeck.leader.value?.card
  return leader ? `${optDeck.stats.value.count} ${t('dash.cards')} · Leader ${leader.number}` : `${optDeck.stats.value.count} ${t('dash.cards')}`
})
</script>

<template>
  <div v-if="deck" class="op-deck fade-up">
    <BuilderDeckToolbar
      v-model:deck-name="name"
      :dots="dots"
      :card-count="optDeck.stats.value.count"
      :logged-in="loggedIn"
      :can-undo="autosave.canUndo.value"
      :can-redo="autosave.canRedo.value"
      @open-import-export="openText"
      @share="showShare = true"
      @save="showWall = true"
      @undo="autosave.undo"
      @redo="autosave.redo"
    />

    <div class="workspace">
      <OptcgDeckPanel
        class="ws-deck"
        :lines="optDeck.lines.value"
        :leader="optDeck.leader.value"
        :validation="optDeck.validation.value"
        :stats="optDeck.stats.value"
        :resolving="optDeck.resolving.value"
        :unknown="optDeck.unknown.value"
        :unreadable="optDeck.unreadable.value"
        :lang="lang"
        @set-quantity="optDeck.setQuantity"
        @remove="optDeck.remove"
        @open="openLine"
      />

      <section class="ws-search">
        <OptcgFilterRail
          v-model:filters="filters"
          class="ws-rail"
          :lang="lang"
          :leader-colors="leaderColors"
          :categories="categories"
          :autocomplete="autocomplete"
          @change="runSearch"
          @text-input="onTextInput"
          @pick="openCard"
        />

        <div class="ws-results">
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
              :lang="lang"
              :quantity="optDeck.quantityOf(card.number)"
              addable
              @open="openCard"
              @add="add"
            />
          </div>
          <div v-if="state.hasMore" class="more">
            <UButton color="neutral" variant="subtle" :loading="state.loading" @click="loadMore">
              {{ t('optcg.loadMore') }}
            </UButton>
          </div>
        </div>
      </section>
    </div>

    <OptcgCardSheet
      v-model:open="sheetOpen"
      :card="sheetCard"
      :lang="lang"
      :quantity="sheetCard ? optDeck.quantityOf(sheetCard.number) : 0"
      :line-art="sheetLine?.entry.art ?? null"
      @add="add"
      @remove="removeOne"
      @set-art="setArt"
    />

    <UModal v-model:open="showText" :title="t('build.importExportTitle')">
      <template #body>
        <div class="space-y-3">
          <p class="text-sm text-(--color-text-muted)">
            {{ t('optcg.export.hint') }}
          </p>
          <textarea
            v-model="textDraft"
            name="optcg-list"
            aria-label="Decklist"
            rows="14"
            spellcheck="false"
            placeholder="1xOP01-001&#10;4xOP01-016"
            class="w-full resize-y rounded-[var(--radius-md)] border border-(--color-border-subtle) bg-(--color-surface-1) p-3 font-mono text-sm text-(--color-text-high) focus:border-(--accent-border) focus:outline-none"
          />
          <p class="text-xs text-(--color-text-muted)">
            <UIcon name="i-lucide-printer-check" class="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            {{ t('optcg.export.noPrint') }}
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" icon="i-lucide-clipboard-copy" @click="copyText">
            {{ t('build.copy') }}
          </UButton>
          <UButton color="primary" icon="i-lucide-check" @click="applyText">
            {{ t('build.apply') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <DeckShareModal v-model:open="showShare" :deck="deck" />
    <DeckSaveWall v-model:open="showWall" :deck-name="name" :summary="summary" universe="optcg" />
  </div>
</template>

<style scoped>
.op-deck {
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
  .op-deck {
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
