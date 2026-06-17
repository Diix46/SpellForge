<script setup lang="ts">
import type { ManaColor } from '~/composables/useManaIdentity'
import type { PageFormat, PdfSettings } from '~/composables/usePdfExport'
import type { ResolvedCard, ScryfallCard } from '~/composables/useScryfall'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCardmarket } from '~/composables/useCardmarket'
import { useDeckAnalysis } from '~/composables/useDeckAnalysis'
import { useDeckBuilder, validateCommander } from '~/composables/useDeckBuilder'
import { useDecklist } from '~/composables/useDecklist'
import { useDeckStore } from '~/composables/useDeckStore'
import { useManaIdentity } from '~/composables/useManaIdentity'
import { usePdfExport } from '~/composables/usePdfExport'
import { useScryfall } from '~/composables/useScryfall'

const route = useRoute()
const deckId = computed(() => route.params.id as string)

const { getDeck, updateDeck } = useDeckStore()
const { parse, totalCards } = useDecklist()
const { fetchCollection } = useScryfall()
const { exportPdf } = usePdfExport()
const { linksForResolved, wantsListText, wantsListImportUrl } = useCardmarket()
const { identity, colorVar, accentStyle } = useManaIdentity()
const { typeStats, detectCommanderIndex, commanderColors } = useDeckAnalysis()
const { locale, t } = useLocale()
const toast = useToast()

const deck = computed(() => getDeck(deckId.value))

useSeoMeta({
  title: () => deck.value ? `${deck.value.name}` : 'Deck',
})

const rawDecklist = ref('')
const deckName = ref('')
// Card language follows the site locale (FR site → FR card images, EN → EN).
const lang = computed<'en' | 'fr'>(() => locale.value)

const settings = ref<Omit<PdfSettings, 'format'>>({
  orientation: 'portrait',
  marginMm: 8,
  gapMm: 1,
  cutGuides: true,
  includeBack: false,
})

const resolvedCards = ref<ResolvedCard[]>([])
const fetching = ref(false)
const fetchProgress = ref({ loaded: 0, total: 0 })
const exporting = ref<PageFormat | null>(null)
const exportProgress = ref({ loaded: 0, total: 0, phase: '' })

const activeTab = ref<'deck' | 'preview' | 'buy'>('deck')

// Import/Export modal (the old raw-text editor lives here now).
const showImportExport = ref(false)
const importExportText = ref('')
function openImportExport() {
  importExportText.value = rawDecklist.value
  showImportExport.value = true
}
function applyImportExport() {
  rawDecklist.value = importExportText.value
  showImportExport.value = false
}
function copyDecklistText() {
  navigator.clipboard.writeText(rawDecklist.value)
  toast.add({ title: t('toast.listCopied'), color: 'success', icon: 'i-lucide-clipboard-check' })
}

// Commander override (index into resolvedCards), -1 = auto
const commanderOverride = ref(-1)

// ---- Builder (edits the deck on top of rawDecklist) ----
const builder = useDeckBuilder({
  get: () => rawDecklist.value,
  set: (v) => { rawDecklist.value = v },
})
// Reload the builder's structured view whenever the raw text changes from elsewhere
// (initial mount, paste in the Edit tab, import). Guard against feedback loops:
// builder.serialise() sets rawDecklist, which we don't want to echo back as a reload.
let builderWriting = false
watch(rawDecklist, () => {
  if (builderWriting)
    return
  builder.load()
})
function builderOp(fn: () => void) {
  builderWriting = true
  fn()
  builderWriting = false
}

// Names already in the deck (lowercased) — for the search "added" state.
const inDeckNames = computed(() => new Set(builder.entries.value.map(e => e.name.trim().toLowerCase())))

// Maps derived from resolved cards (when loaded) for grouping + EDH validation.
const categoryByName = computed(() => {
  const m = new Map<string, string>()
  for (const rc of resolvedCards.value) {
    const tl = (rc.card?.type_line ?? '').toLowerCase()
    const cat = tl.includes('land')
      ? 'land'
      : tl.includes('creature')
        ? 'creature'
        : tl.includes('instant')
          ? 'instant'
          : tl.includes('sorcery')
            ? 'sorcery'
            : tl.includes('artifact')
              ? 'artifact'
              : tl.includes('enchantment')
                ? 'enchantment'
                : tl.includes('planeswalker') ? 'planeswalker' : 'other'
    m.set(rc.entry.name.trim().toLowerCase(), cat)
  }
  return m
})
const identityByName = computed(() => {
  const m = new Map<string, string[]>()
  for (const rc of resolvedCards.value) {
    if (rc.card?.color_identity)
      m.set(rc.entry.name.trim().toLowerCase(), rc.card.color_identity)
  }
  return m
})
// name(lower) → color identity letters (for the deck-panel colour distribution).
const colorByName = computed(() => identityByName.value)

// Commander identity lock: when on, out-of-identity cards can't be added.
const identityLocked = ref(true)
// True when the decklist changed since the last resolve (preview/stats stale).
const resolvedDirty = ref(false)

function isWithinIdentity(card: ScryfallCard): boolean {
  // `commander` is defined later but this only runs from event handlers (lazy-safe).
  // eslint-disable-next-line ts/no-use-before-define
  const allowed = commander.value?.card?.color_identity
  if (!identityLocked.value || !allowed)
    return true
  const set = new Set(allowed.map(c => c.toLowerCase()))
  return (card.color_identity ?? []).every(c => set.has(c.toLowerCase()))
}

function addSearchCard(card: ScryfallCard) {
  if (!isWithinIdentity(card)) {
    toast.add({ title: t('toast.outOfIdentity'), description: card.name, color: 'warning', icon: 'i-lucide-shield-alert' })
    return
  }
  builderOp(() => builder.addScryfallCard(card))
  resolvedDirty.value = true
  toast.add({ title: t('toast.added'), description: card.name, color: 'success', icon: 'i-lucide-plus' })
}
function builderSetQty(name: string, qty: number) {
  builderOp(() => builder.setQuantity(name, qty))
  resolvedDirty.value = true
}
function builderRemove(name: string) {
  builderOp(() => builder.removeCard(name))
  resolvedDirty.value = true
}
function builderSetCommander(name: string) {
  builderOp(() => builder.setCommander(name))
}

// Card detail modal
const detailCard = ref<ResolvedCard | null>(null)
const showDetail = ref(false)
function openDetail(card: ResolvedCard) {
  detailCard.value = card
  showDetail.value = true
}

// Pagination
const PAGE_SIZE = 24
const page = ref(1)

onMounted(() => {
  if (!deck.value) {
    navigateTo('/')
    return
  }
  rawDecklist.value = deck.value.raw
  deckName.value = deck.value.name
  builder.load()
})

let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave() {
  if (saveTimer)
    clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (!deck.value)
      return
    updateDeck(deckId.value, { raw: rawDecklist.value, name: deckName.value })
  }, 600)
}
watch([rawDecklist, deckName], scheduleSave)

// Flush any pending save and drop the timer when leaving the page.
onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer)
    if (deck.value)
      updateDeck(deckId.value, { raw: rawDecklist.value, name: deckName.value })
  }
})

const parsed = computed(() => rawDecklist.value.trim() ? parse(rawDecklist.value) : null)
const allEntries = computed(() => parsed.value ? [...parsed.value.mainboard, ...parsed.value.sideboard] : [])
const cardCount = computed(() => parsed.value ? totalCards(parsed.value.mainboard) + totalCards(parsed.value.sideboard) : 0)

const successCards = computed(() => resolvedCards.value.filter(c => c.imageUrl))
const errorCards = computed(() => resolvedCards.value.filter(c => !c.imageUrl))
const frCount = computed(() => resolvedCards.value.filter(c => c.lang === 'fr').length)

// ---- Commander + dynamic theme ----
const commanderIndex = computed(() => {
  if (commanderOverride.value >= 0 && resolvedCards.value[commanderOverride.value])
    return commanderOverride.value
  return detectCommanderIndex(resolvedCards.value)
})
const commander = computed(() =>
  commanderIndex.value >= 0 ? resolvedCards.value[commanderIndex.value] : null,
)

// Locale-aware commander name + type line.
const commanderName = computed(() => {
  const c = commander.value?.card
  if (!c)
    return commander.value?.entry.name ?? ''
  return locale.value === 'fr' ? (c.printed_name ?? c.name) : (c.name ?? c.printed_name ?? '')
})
const commanderType = computed(() => {
  const c = commander.value?.card
  if (!c)
    return ''
  return locale.value === 'fr'
    ? (c.printed_type_line ?? c.type_line ?? '')
    : (c.type_line ?? c.printed_type_line ?? '')
})

// Theme colors: from commander if resolved, else from decklist heuristic, else neutral.
const themeColors = computed(() => {
  if (commander.value?.card)
    return commanderColors(commander.value.card)
  return identity(rawDecklist.value)
})
const themeStyle = computed(() => accentStyle(themeColors.value))

// Drive the app-wide theme (background aurora + accents) from this deck's colours.
const appTheme = useAppTheme()
watch(themeColors, (c) => {
  appTheme.setColors(c)
}, { immediate: true })
onBeforeUnmount(() => appTheme.reset())

// ---- Builder search constraint + validation (depend on commander/theme above) ----
// Search constraint: the commander's color identity (null until known).
const builderIdentity = computed<ManaColor[] | null>(() => {
  if (commander.value?.card)
    return commanderColors(commander.value.card)
  return themeColors.value.length ? themeColors.value : null
})

const validation = computed(() => validateCommander(builder.entries.value, {
  commanderName: builder.commanderName.value || commanderName.value,
  identityByName: identityByName.value,
  commanderIdentity: commander.value?.card?.color_identity,
}))

// Cards excluding the commander (for the grid).
const gridCards = computed(() =>
  resolvedCards.value.filter((_, i) => i !== commanderIndex.value),
)

// ---- Stats ----
const stats = computed(() => typeStats(resolvedCards.value))

// ---- Pagination ----
const totalPages = computed(() => Math.max(1, Math.ceil(gridCards.value.length / PAGE_SIZE)))
const pagedCards = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return gridCards.value.slice(start, start + PAGE_SIZE)
})
watch(gridCards, () => {
  if (page.value > totalPages.value)
    page.value = 1
})

async function loadCards() {
  if (cardCount.value === 0)
    return
  fetching.value = true
  fetchProgress.value = { loaded: 0, total: cardCount.value }
  commanderOverride.value = -1
  page.value = 1
  try {
    resolvedCards.value = await fetchCollection(allEntries.value, lang.value, (p) => {
      fetchProgress.value = p
    })
    resolvedDirty.value = false
    // Jump to preview only when the user isn't actively building.
    if (activeTab.value !== 'deck')
      activeTab.value = 'preview'
    const missing = resolvedCards.value.filter(c => !c.imageUrl).length
    toast.add({
      title: t('toast.cardsLoaded'),
      description: missing
        ? `${successCards.value.length} OK, ${missing} ${t('toast.notFoundCount')}`
        : `${successCards.value.length} ${t('toast.cardsReady')}`,
      color: missing ? 'warning' : 'success',
      icon: missing ? 'i-lucide-alert-triangle' : 'i-lucide-check',
    })
  }
  catch (err: unknown) {
    toast.add({ title: t('toast.loadError'), description: errMessage(err), color: 'error' })
  }
  finally {
    fetching.value = false
  }
}

function setCommander(card: ResolvedCard) {
  const idx = resolvedCards.value.indexOf(card)
  if (idx >= 0) {
    commanderOverride.value = idx
    page.value = 1
    toast.add({ title: t('toast.commanderSet'), description: card.card?.name ?? card.entry.name, icon: 'i-lucide-crown', color: 'success' })
  }
}

async function doExport(format: PageFormat) {
  if (successCards.value.length === 0) {
    toast.add({ title: t('toast.loadFirst'), color: 'warning', icon: 'i-lucide-alert-triangle' })
    return
  }
  exporting.value = format
  exportProgress.value = { loaded: 0, total: 0, phase: 'loading' }
  try {
    const fullSettings: PdfSettings = { ...settings.value, format }
    const safeName = (deckName.value || 'deck').replace(/[^a-z0-9]+/gi, '_').toLowerCase()
    const filename = `${safeName}_${format.toUpperCase()}_${lang.value}.pdf`
    await exportPdf(resolvedCards.value, fullSettings, filename, (p) => {
      exportProgress.value = { loaded: p.loaded, total: p.total, phase: p.phase }
    })
    toast.add({ title: t('toast.pdfDone'), description: filename, color: 'success', icon: 'i-lucide-file-down' })
  }
  catch (err: unknown) {
    toast.add({ title: t('toast.exportFailed'), description: errMessage(err), color: 'error', icon: 'i-lucide-x' })
  }
  finally {
    exporting.value = null
  }
}

const cmLinks = computed(() => linksForResolved(
  resolvedCards.value.length
    ? resolvedCards.value
    : allEntries.value.map(e => ({ entry: e, card: null, imageUrl: null, backImageUrl: null, lang: 'en' })),
))

function openAllCardmarket() {
  const links = cmLinks.value.slice(0, 15)
  for (const l of links) window.open(l.url, '_blank')
  if (cmLinks.value.length > 15) {
    toast.add({
      title: t('toast.tooManyCards'),
      description: `${cmLinks.value.length} ${t('editor.cardsWord')} — ${t('toast.tooManyCardsDesc')}`,
      color: 'info',
    })
  }
}

function copyWantsList() {
  navigator.clipboard.writeText(wantsListText(allEntries.value))
  toast.add({
    title: t('toast.listCopied'),
    description: t('toast.listCopiedDesc'),
    color: 'success',
    icon: 'i-lucide-clipboard-check',
  })
}

const tabItems = computed(() => [
  { label: t('tab.deck'), icon: 'i-lucide-hammer', value: 'deck' as const },
  { label: `${t('tab.preview')}${successCards.value.length ? ` (${successCards.value.length})` : ''}`, icon: 'i-lucide-eye', value: 'preview' as const },
  { label: t('tab.buy'), icon: 'i-lucide-shopping-cart', value: 'buy' as const },
])

const tabsUi = {
  list: 'glass-solid rounded-[var(--radius-lg)] p-1',
  indicator: 'accent-soft-bg rounded-[var(--radius-md)] shadow-[var(--accent-glow-soft)]',
  trigger: 'data-[state=active]:text-(--accent-text) text-(--color-text-muted) font-medium',
}
</script>

<template>
  <div
    v-if="deck"
    class="fade-up"
    :style="themeStyle"
  >
    <!-- HEADER -->
    <div class="mb-6 flex items-center gap-3">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        to="/"
        class="shrink-0"
      />
      <div class="min-w-0 flex-1">
        <input
          v-model="deckName"
          name="deck-name"
          aria-label="Nom du deck"
          class="w-full truncate bg-transparent font-display text-2xl font-bold text-(--color-text-high) caret-(--accent) focus:outline-none md:text-3xl"
        >
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
    </div>

    <!-- TABS -->
    <UTabs
      v-model="activeTab"
      :items="tabItems"
      :content="false"
      :ui="tabsUi"
      class="mb-6 max-w-md"
    />

    <!-- DECK TAB (unified build + edit) -->
    <div v-show="activeTab === 'deck'">
      <!-- toolbar -->
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-clipboard-list"
            color="neutral"
            variant="subtle"
            size="sm"
            @click="openImportExport"
          >
            {{ t('build.importExport') }}
          </UButton>
          <UButton
            v-if="successCards.length === 0 || resolvedDirty"
            :loading="fetching"
            :disabled="cardCount === 0 || fetching"
            color="neutral"
            variant="subtle"
            size="sm"
            icon="i-lucide-refresh-cw"
            @click="loadCards"
          >
            <span v-if="fetching">{{ fetchProgress.loaded }}/{{ fetchProgress.total }}</span>
            <span v-else>{{ t('build.resolve') }}</span>
          </UButton>
        </div>
      </div>

      <div
        class="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(340px,420px)]"
        style="min-height: 70vh"
      >
        <BuilderCardSearchPanel
          :identity="identityLocked ? builderIdentity : null"
          :in-deck="inDeckNames"
          @add="addSearchCard"
          @details="(c) => openDetail({ entry: { quantity: 1, name: c.name }, card: c, imageUrl: c.image_uris?.normal ?? null, backImageUrl: null, lang: c.lang })"
        />
        <BuilderDeckListPanel
          :entries="builder.entries.value"
          :total="builder.totalCards.value"
          :commander-name="builder.commanderName.value || commanderName"
          :validation="validation"
          :category-by-name="categoryByName"
          :color-by-name="colorByName"
          :identity-locked="identityLocked"
          @set-qty="builderSetQty"
          @remove="builderRemove"
          @set-commander="builderSetCommander"
          @toggle-lock="identityLocked = !identityLocked"
        />
      </div>
    </div>

    <!-- PREVIEW TAB -->
    <div v-show="activeTab === 'preview'">
      <div
        v-if="resolvedCards.length === 0"
        class="glass mx-auto flex max-w-md flex-col items-center rounded-[var(--radius-2xl)] py-16 text-center"
      >
        <UIcon
          name="i-lucide-image-off"
          class="mb-3 h-12 w-12 text-(--color-text-muted)"
        />
        <p class="mb-4 text-(--color-text-muted)">
          {{ t('editor.noCards') }}
        </p>
        <UButton
          color="neutral"
          variant="solid"
          icon="i-lucide-images"
          :loading="fetching"
          @click="loadCards"
        >
          {{ t('editor.loadCards') }}
        </UButton>
      </div>

      <div
        v-else
        class="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]"
      >
        <!-- LEFT: commander + stats + grid -->
        <div class="order-2 space-y-6 lg:order-1">
          <!-- Commander feature -->
          <div
            v-if="commander"
            class="glass relative overflow-hidden rounded-[var(--radius-xl)] p-5"
          >
            <div class="flex flex-col gap-4 sm:flex-row">
              <button
                class="holo-sheen relative w-32 shrink-0 self-center overflow-hidden rounded-[var(--radius-lg)] ring-2 ring-(--accent-border) sm:self-start"
                :style="{ boxShadow: 'var(--accent-glow-soft)' }"
                @click="openDetail(commander)"
              >
                <img
                  :src="commander.imageUrl!"
                  :alt="commander.card?.name"
                  class="block w-full"
                >
              </button>
              <div class="min-w-0 flex-1">
                <div class="mb-1 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[2px] text-(--accent-text)">
                  <UIcon
                    name="i-lucide-crown"
                    class="h-3.5 w-3.5"
                  />
                  {{ t('commander.label') }}
                </div>
                <h3 class="font-display text-lg font-bold text-(--color-text-high)">
                  {{ commanderName }}
                </h3>
                <p class="mt-0.5 text-sm text-(--color-text-muted)">
                  {{ commanderType }}
                </p>
                <div class="mt-3 flex items-center gap-1.5">
                  <span
                    v-for="c in themeColors"
                    :key="c"
                    class="h-3 w-3 rounded-full ring-1 ring-white/10"
                    :style="{ background: colorVar(c), boxShadow: `0 0 8px ${colorVar(c)}` }"
                  />
                  <span class="ml-1 font-mono text-xs text-(--color-text-muted)">
                    {{ t('commander.identity') }} {{ themeColors.length ? themeColors.join('').toUpperCase() : t('tile.colorless') }}
                  </span>
                </div>
                <UButton
                  class="mt-3"
                  size="xs"
                  color="neutral"
                  variant="subtle"
                  icon="i-lucide-search"
                  @click="openDetail(commander)"
                >
                  {{ t('commander.details') }}
                </UButton>
              </div>
            </div>
          </div>

          <!-- Type stats -->
          <div
            v-if="stats.length"
            class="glass-solid rounded-[var(--radius-xl)] p-4"
          >
            <h3 class="mb-3 font-mono text-[11px] uppercase tracking-[2px] text-(--color-text-muted)">
              {{ t('stats.title') }}
            </h3>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div
                v-for="s in stats"
                :key="s.key"
                class="flex items-center gap-2 rounded-[var(--radius-md)] bg-(--color-surface-2)/50 px-3 py-2"
              >
                <UIcon
                  :name="s.icon"
                  class="h-4 w-4 text-(--accent-text)"
                />
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

          <!-- Errors -->
          <div
            v-if="errorCards.length"
            class="rounded-[var(--radius-lg)] border border-(--color-warning)/40 bg-(--color-warning)/10 p-3 text-sm"
          >
            <div class="mb-1 flex items-center gap-2 font-medium text-(--color-warning)">
              <UIcon
                name="i-lucide-alert-triangle"
                class="h-4 w-4"
              />
              {{ errorCards.length }} {{ t('errors.notFound') }}
            </div>
            <p class="text-xs text-(--color-text-muted)">
              {{ errorCards.map(c => c.entry.name).join(', ') }}
            </p>
          </div>

          <!-- Grid -->
          <div>
            <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              <MtgCardPreview
                v-for="(card, idx) in pagedCards"
                :key="(page - 1) * PAGE_SIZE + idx"
                :card="card"
                :index="idx"
                @details="openDetail"
              />
            </div>

            <!-- Pagination -->
            <div
              v-if="totalPages > 1"
              class="mt-6 flex items-center justify-center gap-2"
            >
              <UButton
                icon="i-lucide-chevron-left"
                color="neutral"
                variant="subtle"
                size="sm"
                :disabled="page === 1"
                @click="page--"
              />
              <span class="font-mono text-sm text-(--color-text-mid)">
                <span class="text-(--accent-text)">{{ page }}</span> / {{ totalPages }}
              </span>
              <UButton
                icon="i-lucide-chevron-right"
                color="neutral"
                variant="subtle"
                size="sm"
                :disabled="page === totalPages"
                @click="page++"
              />
            </div>
          </div>
        </div>

        <!-- RIGHT: export console -->
        <div class="order-1 lg:order-2">
          <div class="lg:sticky lg:top-24">
            <ExportConsole
              v-model:settings="settings"
              :cards="resolvedCards"
              :unique-count="successCards.length"
              :fr-count="frCount"
              :lang="lang"
              :exporting="exporting"
              :export-progress="exportProgress"
              @export="doExport"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- BUY TAB -->
    <div
      v-show="activeTab === 'buy'"
      class="space-y-5"
    >
      <div class="glass rounded-[var(--radius-xl)] p-5">
        <div class="mb-4 flex items-center gap-2">
          <div class="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] accent-soft-bg">
            <UIcon
              name="i-lucide-shopping-cart"
              class="h-5 w-5 text-(--accent-text)"
            />
          </div>
          <div>
            <h3 class="font-display font-semibold text-(--color-text-high)">
              {{ t('buy.title') }}
            </h3>
            <p class="font-mono text-xs text-(--color-text-muted)">
              {{ cmLinks.length }} {{ t('buy.uniqueCards') }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-external-link"
            color="neutral"
            variant="solid"
            @click="openAllCardmarket"
          >
            {{ t('buy.openCards') }}
          </UButton>
          <UButton
            icon="i-lucide-clipboard-copy"
            color="neutral"
            variant="subtle"
            @click="copyWantsList"
          >
            {{ t('buy.copyWants') }}
          </UButton>
          <UButton
            icon="i-lucide-external-link"
            color="neutral"
            variant="ghost"
            :to="wantsListImportUrl()"
            target="_blank"
          >
            {{ t('buy.openWants') }}
          </UButton>
        </div>
      </div>

      <div
        v-if="cmLinks.length"
        class="glass-solid overflow-hidden rounded-[var(--radius-xl)]"
      >
        <div
          v-for="link in cmLinks"
          :key="link.name"
          class="flex items-center justify-between border-b border-(--color-border-subtle) px-4 py-2.5 transition-colors last:border-0 hover:bg-(--color-surface-2)/50"
        >
          <div class="flex min-w-0 items-center gap-2.5">
            <span class="accent-soft-bg rounded-md px-2 py-0.5 font-mono text-xs text-(--accent-text)">{{ link.quantity }}×</span>
            <span class="truncate text-sm text-(--color-text-mid)">{{ link.name }}</span>
          </div>
          <UButton
            :to="link.url"
            target="_blank"
            icon="i-lucide-external-link"
            color="neutral"
            variant="ghost"
            size="xs"
          >
            Cardmarket
          </UButton>
        </div>
      </div>
    </div>

    <!-- Import / Export decklist modal (the old text editor) -->
    <UModal
      v-model:open="showImportExport"
      :title="t('build.importExportTitle')"
      :ui="{ overlay: 'bg-ink-950/70 backdrop-blur-[6px]', content: 'glass rounded-[var(--radius-2xl)]' }"
    >
      <template #body>
        <div class="space-y-3">
          <p class="text-sm text-(--color-text-muted)">
            {{ t('build.importExportHelp') }}
          </p>
          <textarea
            v-model="importExportText"
            name="import-export"
            aria-label="Decklist"
            rows="16"
            spellcheck="false"
            placeholder="1 Atraxa, Praetors' Voice&#10;1 Sol Ring&#10;…"
            class="glass-solid w-full resize-y rounded-[var(--radius-lg)] bg-(--color-surface-2)/60 p-3 font-mono text-sm leading-relaxed text-(--color-text-high) placeholder:text-(--color-text-disabled) focus:border-(--accent-border) focus:outline-none focus:ring-1 focus:ring-(--accent-border)"
          />
          <div
            v-if="parsed?.errors.length"
            class="flex flex-wrap gap-1.5"
          >
            <span
              v-for="err in parsed.errors"
              :key="err"
              class="rounded-full border border-(--color-error)/40 bg-(--color-error)/10 px-2.5 py-0.5 text-xs text-(--color-error)"
            >
              {{ err }}
            </span>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-clipboard-copy"
            @click="copyDecklistText"
          >
            {{ t('build.copy') }}
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-check"
            @click="applyImportExport"
          >
            {{ t('build.apply') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Card detail modal -->
    <CardDetailModal
      v-model:open="showDetail"
      :card="detailCard"
      :is-commander="!!detailCard && detailCard === commander"
      @set-commander="(c) => { setCommander(c); showDetail = false }"
    />
  </div>
</template>
