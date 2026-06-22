<script setup lang="ts">
import type { CategoryKey, ManaColor } from '~/composables/useMtg'
import type { ResolvedCard, ScryfallCard } from '~/composables/useScryfall'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDeckAnalysis } from '~/composables/useDeckAnalysis'
import { useDeckBuilder, validateCommander } from '~/composables/useDeckBuilder'
import { useDeckBuy } from '~/composables/useDeckBuy'
import { useDeckExport } from '~/composables/useDeckExport'
import { useDecklist } from '~/composables/useDecklist'
import { useDeckStore } from '~/composables/useDeckStore'
import { useManaIdentity } from '~/composables/useManaIdentity'
import { classifyType, displayName, displayType, englishTypeLine } from '~/composables/useMtg'
import { useScryfall } from '~/composables/useScryfall'

const route = useRoute()
const router = useRouter()
const deckId = computed(() => route.params.id as string)

const { getDeck, updateDeck, setShare, ready: storeReady } = useDeckStore()
const { loggedIn } = useAuth()
const { parse, totalCards } = useDecklist()
const { fetchCollection } = useScryfall()
const { identity, colorVar, accentStyle } = useManaIdentity()
const { typeStats, detectCommanderIndex, commanderColors, manaCurve, priceSummary } = useDeckAnalysis()
const { locale, t } = useLocale()
const toast = useToast()

const deck = computed(() => getDeck(deckId.value))

useSeoMeta({
  title: () => deck.value ? `${deck.value.name}` : 'Deck',
})

// Lock the app shell to one viewport on the deck page: the workspace fills the
// space and scrolls internally, the footer stays pinned — no page scroll.
const appFullscreen = useState('app-fullscreen', () => false)
onMounted(() => (appFullscreen.value = true))
onBeforeUnmount(() => (appFullscreen.value = false))

const rawDecklist = ref('')
const deckName = ref('')
// Card language follows the site locale (FR site → FR card images, EN → EN).
const lang = computed<'en' | 'fr'>(() => locale.value)

const resolvedCards = ref<ResolvedCard[]>([])
const fetching = ref(false)
// Monotonic token: each loadCards() call claims the next value. A slower,
// superseded resolve (e.g. deck A still in-flight when we switch to B) checks
// its token before committing, so it can't clobber the current deck's cards.
let loadToken = 0
const fetchProgress = ref({ loaded: 0, total: 0 })

// Overlay open-state (Preview / Buy / Coach) + Esc-to-close + ?preview/?buy
// deep-link sync. The page opens them (toolbar, deep-link in initDeck). See
// useDeckOverlays.
const { previewOpen, buyOpen, coachOpen } = useDeckOverlays(route, router)

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

// Enable public sharing for this (cloud) deck and copy the link to the clipboard.
const sharing = ref(false)
async function shareDeck() {
  sharing.value = true
  try {
    const shareId = await setShare(deckId.value, true)
    if (!shareId)
      throw new Error('no share id')
    const url = `${window.location.origin}/shared/${shareId}`
    await navigator.clipboard.writeText(url)
    toast.add({ title: t('share.copied'), description: url, color: 'success', icon: 'i-lucide-link' })
  }
  catch {
    toast.add({ title: t('share.error'), color: 'error', icon: 'i-lucide-x' })
  }
  finally {
    sharing.value = false
  }
}
// Download the current decklist as a .txt file.
function downloadDecklist() {
  const safeName = (deckName.value || 'deck').replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  const blob = new Blob([rawDecklist.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
// Load a .txt/.dec file into the import textarea.
const importFileInput = ref<HTMLInputElement | null>(null)
function pickImportFile() {
  importFileInput.value?.click()
}
async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return
  importExportText.value = await file.text()
  input.value = '' // allow re-picking the same file
}

// Commander override (index into resolvedCards), -1 = auto
const commanderOverride = ref(-1)

// Pagination state (declared early: builder ops reset the page on commander change).
const PAGE_SIZE = 24
const page = ref(1)

// True when the decklist changed since the last image resolve (preview stale).
const resolvedDirty = ref(false)

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
  // Any decklist change makes the resolved preview stale (covers builder ops,
  // textarea edits, import). The auto-load watcher re-resolves on next preview.
  resolvedDirty.value = true
  if (builderWriting)
    return
  builder.load()
})
function builderOp(fn: () => void) {
  builderWriting = true
  fn()
  // The rawDecklist watcher flushes asynchronously, so only clear the guard
  // after that flush — otherwise builder writes would reload (and clobber) the
  // very edit we just made.
  nextTick(() => (builderWriting = false))
}

// Names already in the deck (lowercased) — for the search "added" state.
const inDeckNames = computed(() => new Set(builder.entries.value.map(e => e.name.trim().toLowerCase())))

// Maps derived from resolved cards (when loaded) for grouping + EDH validation.
const categoryByName = computed(() => {
  const m = new Map<string, string>()
  for (const rc of resolvedCards.value)
    m.set(rc.entry.name.trim().toLowerCase(), classifyType(englishTypeLine(rc.card)))
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
// name(lower) → localized display name (FR printed name when the site is FR).
const displayNameByName = computed(() => {
  const m = new Map<string, string>()
  const isFr = locale.value === 'fr'
  for (const rc of resolvedCards.value) {
    if (rc.card)
      m.set(rc.entry.name.trim().toLowerCase(), displayName(rc.card, isFr))
  }
  return m
})
// name(lower) → { thumbnail, large image, mana cost } for the enriched deck rows.
const cardMetaByName = computed(() => {
  const m = new Map<string, { thumb: string | null, image: string | null, manaCost: string }>()
  for (const rc of resolvedCards.value) {
    const c = rc.card
    if (!c)
      continue
    const uris = c.image_uris ?? c.card_faces?.[0]?.image_uris
    m.set(rc.entry.name.trim().toLowerCase(), {
      thumb: uris?.small ?? uris?.normal ?? null,
      image: rc.imageUrl ?? uris?.normal ?? null,
      manaCost: c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? '',
    })
  }
  return m
})

// Commander identity lock: when on, out-of-identity cards can't be added.
const identityLocked = ref(true)

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
  toast.add({ title: t('toast.added'), description: card.name, color: 'success', icon: 'i-lucide-plus' })
}
// Remove a card from the deck via the search grid's green-check toggle.
function removeSearchCard(card: ScryfallCard) {
  builderOp(() => builder.removeCard(card.name))
  toast.add({ title: t('toast.removed'), description: card.name, color: 'neutral', icon: 'i-lucide-minus' })
}
function builderSetQty(name: string, qty: number) {
  builderOp(() => builder.setQuantity(name, qty))
}
function builderRemove(name: string) {
  builderOp(() => builder.removeCard(name))
}

// ---- Drag & drop between the search grid and the deck list ----
// Drop a SEARCH card onto the deck → add it (by canonical English name). If the
// dragged card resolves to a known Scryfall card that's out of identity, reuse
// the identity gate; otherwise add by name.
function onDropAdd(name: string) {
  // eslint-disable-next-line ts/no-use-before-define
  const card = resolvedByName.value.get(name.trim().toLowerCase())?.card
  if (card) {
    addSearchCard(card)
    return
  }
  if (inDeckNames.value.has(name.trim().toLowerCase()))
    return
  builderOp(() => builder.addCard(name))
  toast.add({ title: t('toast.added'), description: name, color: 'success', icon: 'i-lucide-plus' })
}
// Drop a DECK card onto the search panel → remove it.
function onDropRemove(name: string) {
  builderOp(() => builder.removeCard(name))
  toast.add({ title: t('toast.removed'), description: name, color: 'neutral', icon: 'i-lucide-minus' })
}

// Resolved cards indexed by lowercased name for O(1) lookups. Keyed by BOTH the
// original entry name (what the user typed, possibly French) and the canonical
// English card name, so a lookup by either resolves. Built once per resolve
// instead of re-scanning resolvedCards on every entry (was O(n²)).
const resolvedByName = computed(() => {
  const map = new Map<string, ResolvedCard>()
  for (const rc of resolvedCards.value) {
    map.set(rc.entry.name.trim().toLowerCase(), rc)
    if (rc.card?.name)
      map.set(rc.card.name.trim().toLowerCase(), rc)
  }
  return map
})
function resolvedFor(name: string): ResolvedCard | undefined {
  return resolvedByName.value.get(name.trim().toLowerCase())
}

// ---- AI assistance ----
// English card names (prefers the resolved canonical name) — sent to the Coach
// as deck context so its Scryfall/EDHREC tools resolve them.
const aiCardNames = computed(() => builder.entries.value.map(e => resolvedFor(e.name)?.card?.name ?? e.name))
// Single entry point for picking a commander: keep the builder's commander name
// and the resolved-card override in sync so theme/featured/validation all agree.
function chooseCommander(name: string) {
  builderOp(() => builder.setCommander(name))
  const rc = resolvedFor(name)
  commanderOverride.value = rc ? resolvedCards.value.indexOf(rc) : -1 // -1 = auto-detect until resolved
  page.value = 1
}

// Card detail modal
const detailCard = ref<ResolvedCard | null>(null)
const showDetail = ref(false)
function openDetail(card: ResolvedCard) {
  detailCard.value = card
  showDetail.value = true
}

// Build a high-quality ResolvedCard from a raw search result (large image, DFC
// back) so the enlarged detail modal shows a crisp card, not the small thumb.
function openSearchDetail(c: ScryfallCard) {
  const front = c.image_uris?.large ?? c.image_uris?.png ?? c.image_uris?.normal
    ?? c.card_faces?.[0]?.image_uris?.large ?? c.card_faces?.[0]?.image_uris?.normal ?? null
  const back = c.card_faces?.[1]?.image_uris?.large ?? c.card_faces?.[1]?.image_uris?.normal ?? null
  openDetail({ entry: { quantity: 1, name: c.name }, card: c, imageUrl: front, backImageUrl: back, lang: c.lang })
}

// Open the detail modal for a deck-list row (clicked by name). Uses the resolved
// card when available, else a minimal entry so the modal still opens.
function openDeckEntryDetail(name: string) {
  const rc = resolvedFor(name)
  openDetail(rc ?? { entry: { quantity: 1, name }, card: null, imageUrl: null, backImageUrl: null, lang: lang.value })
}

// Debounced autosave. The pending write is bound to the deck that was being
// edited (captured at schedule time), NOT to whatever deck the route points at
// when the timer fires — otherwise switching A→B mid-debounce would save A's
// last edits into B. `pendingSave` holds the captured id + content.
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: { id: string, raw: string, name: string } | null = null
function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (pendingSave) {
    const { id, raw, name } = pendingSave
    pendingSave = null
    if (getDeck(id))
      updateDeck(id, { raw, name })
  }
}
function scheduleSave() {
  const id = deckId.value
  const raw = rawDecklist.value
  const name = deckName.value
  // initDeck assigns the loaded deck into these refs, which trips this watcher.
  // Skip when nothing actually changed so opening a deck doesn't POST a no-op.
  const current = getDeck(id)
  if (current && current.raw === raw && current.name === name)
    return
  pendingSave = { id, raw, name }
  if (saveTimer)
    clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 600)
}

// Init / re-init per deck. Vue Router REUSES this component when only the
// :id param changes, so a watch (not onMounted) is required — otherwise
// navigating deck A→B would leave A's state in place and autosave A into B.
function initDeck(id: string) {
  // Persist any edits to the deck we're leaving BEFORE we overwrite the refs
  // below; otherwise a fast A→B switch drops A's last (still-debounced) changes.
  flushSave()
  const d = getDeck(id)
  if (!d) {
    // Only redirect once the store has finished loading. For a signed-in user
    // arriving via direct navigation/refresh, the cloud decks load async — bailing
    // before storeReady would bounce them home before their deck even arrives.
    if (storeReady.value)
      navigateTo('/')
    return
  }
  rawDecklist.value = d.raw
  deckName.value = d.name
  resolvedCards.value = []
  commanderOverride.value = -1
  page.value = 1
  resolvedDirty.value = false
  // Reset overlays on deck (re)init, then honour a deep-link (?preview / ?buy)
  // so a shared link or refresh opens the right overlay even when the store
  // becomes ready after mount (which re-runs this).
  previewOpen.value = route.query.preview != null
  buyOpen.value = route.query.buy != null
  coachOpen.value = false // reset modal state on deck switch (also detaches Esc)
  builder.load()
  // Resolve images/prices in the background so the Deck tab shows stats, prices
  // and the commander right away (cheap on repeat: server cache + bulk FR).
  // Deferred to nextTick so the computeds/functions below are initialized when
  // this watcher fires immediately during setup.
  nextTick(() => {
    // eslint-disable-next-line ts/no-use-before-define
    if (cardCount.value > 0 && resolvedCards.value.length === 0)

      loadCards({ silent: true })
  })
}

// React to both the route param and the store becoming ready: a direct
// navigation fires before the cloud set arrives, so re-run init when the deck
// finally materializes (or redirect if it truly doesn't exist).
watch([deckId, storeReady], ([id]) => initDeck(id), { immediate: true })

// Schedule a save whenever the user edits the name or list. Skips the
// programmatic resets done by initDeck (those set pendingSave to the value we
// just loaded, which flushSave then no-ops as an identical write — harmless).
watch([rawDecklist, deckName], scheduleSave)

// Flush any pending save when leaving the page entirely.
onBeforeUnmount(flushSave)

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
  return displayName(c, locale.value === 'fr')
})
// Canonical English commander name — EDHREC only knows English names, so the
// suggestions lookup must use this, never the localized display name.
const commanderEnName = computed(() =>
  commander.value?.card?.name ?? (builder.commanderName.value || commanderName.value),
)
const commanderType = computed(() => displayType(commander.value?.card ?? null, locale.value === 'fr'))

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
const curve = computed(() => manaCurve(resolvedCards.value))
const price = computed(() => priceSummary(resolvedCards.value))

// Structured, already-computed deck context fed to the AI so it reasons over
// real numbers instead of recalling them (the model never recounts).
const aiStats = computed(() => {
  const colors: Record<string, number> = {}
  for (const rc of resolvedCards.value) {
    const id = rc.card?.color_identity ?? []
    if (!id.length) {
      colors.c = (colors.c ?? 0) + rc.entry.quantity
    }
    else {
      for (const c of id)
        colors[c.toLowerCase()] = (colors[c.toLowerCase()] ?? 0) + rc.entry.quantity
    }
  }
  return {
    cardCount: cardCount.value,
    avgCmc: curve.value.avg,
    curve: curve.value.buckets,
    types: Object.fromEntries(stats.value.map(s => [s.key, s.count])),
    colors,
    priceTotal: price.value.total,
  }
})

// Compact, plain-text deck summary handed to the conversational Coach as context
// (so it knows the deck without a callback into the app). English card names so
// the agent's Scryfall/EDHREC tools resolve them.
const coachContext = computed(() => {
  const s = aiStats.value
  const id = (builderIdentity.value ?? []).join('').toUpperCase() || 'incolore'
  const lines = [
    `Voici le deck Commander du joueur (format EDH).`,
    `Commandant: ${commanderEnName.value || 'non défini'} — identité couleur: ${id}.`,
    `${s.cardCount} cartes, CMC moyen ${s.avgCmc.toFixed(1)}, prix total ~${s.priceTotal.toFixed(0)}€.`,
    `Courbe de mana (CMC 0..6,7+): ${s.curve.join(', ')}.`,
    `Décklist (noms anglais): ${aiCardNames.value.join(', ') || '(vide)'}.`,
  ]
  return lines.join('\n')
})

// ---- Interactive composition filter (click a type stat to filter the grid) ----
const typeFilter = ref<CategoryKey | null>(null)
function toggleTypeFilter(key: CategoryKey) {
  typeFilter.value = typeFilter.value === key ? null : key
  page.value = 1
}
const filteredGridCards = computed(() => {
  if (!typeFilter.value)
    return gridCards.value
  return gridCards.value.filter(rc => classifyType(englishTypeLine(rc.card)) === typeFilter.value)
})

// ---- Pagination ----
const totalPages = computed(() => Math.max(1, Math.ceil(filteredGridCards.value.length / PAGE_SIZE)))
const pagedCards = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredGridCards.value.slice(start, start + PAGE_SIZE)
})
watch(filteredGridCards, () => {
  if (page.value > totalPages.value)
    page.value = 1
})

async function loadCards(opts: { silent?: boolean } = {}) {
  if (cardCount.value === 0)
    return
  // Claim this resolve and snapshot the inputs. Don't bail when another resolve
  // is running — supersede it: the older one's token is now stale and its result
  // will be discarded below, so switching decks mid-resolve still loads the new one.
  const token = ++loadToken
  const entries = allEntries.value
  const reqLang = lang.value
  fetching.value = true
  fetchProgress.value = { loaded: 0, total: cardCount.value }
  page.value = 1
  try {
    const result = await fetchCollection(
      entries,
      reqLang,
      (p) => {
        if (token === loadToken)
          fetchProgress.value = p
      },
      // Instant first paint: show default-image thumbnails as soon as the
      // collection call returns, before the slower FR art resolves. The token
      // check alone guards against deck-switch races; we deliberately repaint
      // even when cards are already shown so a same-deck re-resolve (after an
      // edit) refreshes the thumbnails instead of leaving stale art.
      (preliminary) => {
        if (token === loadToken)
          resolvedCards.value = preliminary
      },
    )
    if (token !== loadToken)
      return // superseded by a newer load (deck switched) — drop these cards
    resolvedCards.value = result
    resolvedDirty.value = false
    if (opts.silent)
      return
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
    if (token !== loadToken)
      return // a stale resolve failing must not surface an error for the new deck
    toast.add({ title: t('toast.loadError'), description: errMessage(err), color: 'error' })
  }
  finally {
    // Only the current (winning) resolve may clear the in-flight flag.
    if (token === loadToken)
      fetching.value = false
  }
}

// Auto-resolve images when the user opens Preview or Buy (lazy: no requests
// while building). Re-resolves only when the list changed since the last load
// (resolvedDirty) or nothing is loaded yet.
watch([previewOpen, buyOpen], ([p, b]) => {
  if ((p || b) && cardCount.value > 0
    && (resolvedCards.value.length === 0 || resolvedDirty.value)) {
    loadCards({ silent: true })
  }
})

function setCommander(card: ResolvedCard) {
  const name = card.card?.name ?? card.entry.name
  chooseCommander(name)
  toast.add({ title: t('toast.commanderSet'), description: name, icon: 'i-lucide-crown', color: 'success' })
}

// Pin a specific printing on a deck entry, then re-resolve so the chosen art
// (and its price) replaces the auto-picked one across preview/buy/PDF.
async function onSetPrinting(payload: { name: string, set: string, collectorNumber: string }) {
  builderOp(() => builder.setPrinting(payload.name, payload.set, payload.collectorNumber))
  showDetail.value = false
  toast.add({ title: t('toast.printSet'), description: `${payload.set.toUpperCase()} #${payload.collectorNumber}`, icon: 'i-lucide-layers', color: 'success' })
  await loadCards({ silent: true })
}

// PDF proxy export (settings, progress, action, page estimate). See useDeckExport.
const {
  settings,
  exporting,
  exportProgress,
  printPageEstimate,
  doExport,
} = useDeckExport({ resolvedCards, successCards, deckName, lang })

// Buy / checkout (per-card pricing, cost summary, Cardmarket links). See useDeckBuy.
const {
  buyLang,
  buyRows,
  buySummary,
  fmtEur,
  openAllCardmarket,
  copyWantsList,
  buyWholeDeck,
} = useDeckBuy({ resolvedCards, allEntries, price, resolvedFor, locale: lang })
</script>

<template>
  <div
    v-if="deck"
    class="deck-page fade-up"
    :style="themeStyle"
  >
    <!-- UNIFIED TOOLBAR — back · title + pips · tabs · actions, all on one row
         so the deck workspace AND the footer fit within one screen. Wraps on
         narrow viewports. -->
    <div class="deck-toolbar mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        to="/"
        :aria-label="t('nav.backToDecks')"
        class="shrink-0"
      />
      <div class="flex min-w-[180px] flex-1 items-center gap-2.5">
        <input
          v-model="deckName"
          name="deck-name"
          aria-label="Nom du deck"
          class="min-w-0 flex-1 truncate bg-transparent font-display text-xl font-bold text-(--color-text-high) caret-(--accent) focus:outline-none"
        >
        <div class="flex shrink-0 items-center gap-1">
          <span
            v-for="c in themeColors"
            :key="c"
            class="h-2.5 w-2.5 rounded-full"
            :style="{ background: colorVar(c), boxShadow: `0 0 6px ${colorVar(c)}` }"
          />
          <span class="ml-1 font-mono text-xs text-(--color-text-muted)">{{ cardCount }}</span>
        </div>
        <!-- Est. cost chip: glance the price while building; click to open Buy. -->
        <button
          v-if="price.total > 0"
          type="button"
          class="shrink-0 rounded-full bg-(--color-surface-2) px-2.5 py-1 font-mono text-xs font-semibold text-(--accent-text) ring-1 ring-(--color-border-subtle) transition-colors hover:bg-(--color-surface-3)"
          :title="t('buy.estTotal')"
          @click="buyOpen = true"
        >
          ~{{ price.total.toFixed(0) }} €
        </button>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <UButton
          icon="i-lucide-clipboard-list"
          color="neutral"
          variant="subtle"
          size="sm"
          @click="openImportExport"
        >
          <span class="hidden lg:inline">{{ t('build.importExport') }}</span>
        </UButton>
        <UButton
          v-if="successCards.length === 0 || resolvedDirty"
          :loading="fetching"
          :disabled="cardCount === 0 || fetching"
          color="neutral"
          variant="subtle"
          size="sm"
          icon="i-lucide-refresh-cw"
          @click="loadCards()"
        >
          <span v-if="fetching">{{ fetchProgress.loaded }}/{{ fetchProgress.total }}</span>
          <span v-else class="hidden lg:inline">{{ t('build.resolve') }}</span>
        </UButton>
        <UButton
          v-if="loggedIn"
          icon="i-lucide-share-2"
          color="neutral"
          variant="subtle"
          size="sm"
          :loading="sharing"
          @click="shareDeck"
        >
          <span class="hidden lg:inline">{{ t('share.button') }}</span>
        </UButton>

        <!-- Terminal actions: review & print (Aperçu), buy (Acheter). Separated
             from the build/utility actions by a hairline. -->
        <span class="mx-0.5 h-6 w-px bg-(--color-border-subtle)" aria-hidden="true" />
        <UButton
          icon="i-lucide-eye"
          color="neutral"
          variant="subtle"
          size="sm"
          :disabled="cardCount === 0"
          @click="previewOpen = true"
        >
          <span class="hidden sm:inline">{{ t('tab.preview') }}</span>
        </UButton>
        <UButton
          icon="i-lucide-shopping-cart"
          color="primary"
          variant="solid"
          size="sm"
          :disabled="cardCount === 0"
          @click="buyOpen = true"
        >
          <span class="hidden sm:inline">{{ t('tab.buy') }}</span>
        </UButton>
      </div>
    </div>

    <!-- DECK WORKSPACE (the one primary surface; Preview/Buy are overlays) -->
    <div class="deck-tab">
      <!-- Workspace: deck list is the hero (wide, left); card search is the
           compact companion (right). The row fills the remaining viewport height
           and each side scrolls on its own only if its content truly overflows —
           no page scroll, no scrollbar reserved for a few stray pixels. -->
      <div class="deck-workspace grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(320px,380px)]">
        <div class="ws-col">
          <BuilderDeckListPanel
            :entries="builder.entries.value"
            :total="builder.totalCards.value"
            :commander-name="commanderName || builder.commanderName.value"
            :commander-raw-name="commanderEnName"
            :commander-image="commander?.imageUrl ?? null"
            :commander-type="commanderType"
            :commander-colors="themeColors"
            :resolving="fetching && cardMetaByName.size === 0"
            :validation="validation"
            :category-by-name="categoryByName"
            :color-by-name="identityByName"
            :display-name-by-name="displayNameByName"
            :card-meta-by-name="cardMetaByName"
            :identity-locked="identityLocked"
            :curve="curve"
            :price="price"
            @set-qty="builderSetQty"
            @remove="builderRemove"
            @set-commander="chooseCommander"
            @toggle-lock="identityLocked = !identityLocked"
            @details="openDeckEntryDetail"
            @show-commander="commander && openDetail(commander)"
            @drop-add="onDropAdd"
          />
        </div>
        <div class="ws-col">
          <BuilderCardSearchPanel
            :identity="identityLocked ? builderIdentity : null"
            :in-deck="inDeckNames"
            :commander-name="commanderName || builder.commanderName.value"
            :commander-en-name="commanderEnName"
            @add="addSearchCard"
            @remove="removeSearchCard"
            @details="openSearchDetail"
            @drop-remove="onDropRemove"
          />
        </div>
      </div>

      <!-- Coach IA — floating chat widget (teleported to body so it overlays the
           workspace without blocking it). Minimised to a pill by default; the
           deck stays fully visible and interactive while you chat. The
           conversation lives in useState + localStorage, so it persists across
           minimise, tab switches, and reloads. -->
      <Teleport to="body">
        <div class="coach-fab">
          <!-- Panel stays mounted (v-show) so minimising never interrupts an
               in-flight reply or loses scroll position; only its visibility
               toggles. -->
          <Transition name="coach-pop">
            <div v-show="coachOpen" class="coach-panel">
              <BuilderCoachChat
                :deck-context="coachContext"
                :ready="aiCardNames.length > 0"
                @close="coachOpen = false"
              />
            </div>
          </Transition>
          <Transition name="coach-pill">
            <button
              v-if="!coachOpen"
              type="button"
              class="coach-pill"
              @click="coachOpen = true"
            >
              <span class="leading-none">✦</span>
              {{ t('coach.open') }}
            </button>
          </Transition>
        </div>
      </Teleport>
    </div>

    <!-- PREVIEW & PRINT — right slide-over (review visually + export PDF). -->
    <BuilderDeckPreviewOverlay
      v-model:open="previewOpen"
      v-model:settings="settings"
      v-model:page="page"
      v-model:type-filter="typeFilter"
      :commander="commander"
      :commander-name="commanderName"
      :commander-type="commanderType"
      :theme-colors="themeColors"
      :stats="stats"
      :error-cards="errorCards"
      :filtered-grid-cards="filteredGridCards"
      :paged-cards="pagedCards"
      :total-pages="totalPages"
      :resolved-cards="resolvedCards"
      :success-cards="successCards"
      :fr-count="frCount"
      :lang="lang"
      :exporting="exporting"
      :export-progress="exportProgress"
      :fetching="fetching"
      :fetch-progress="fetchProgress"
      :print-page-estimate="printPageEstimate"
      :color-var="colorVar"
      @details="openDetail"
      @toggle-type-filter="toggleTypeFilter"
      @export="doExport"
    />

    <!-- BUY — centered modal overlay (cost summary + per-card list + checkout). -->
    <BuilderDeckBuyOverlay
      v-model:open="buyOpen"
      v-model:buy-lang="buyLang"
      :buy-rows="buyRows"
      :buy-summary="buySummary"
      :loading="resolvedCards.length === 0 && fetching"
      :fetch-progress="fetchProgress"
      :fmt-eur="fmtEur"
      @buy-whole-deck="buyWholeDeck"
      @copy-wants="copyWantsList"
      @open-all="openAllCardmarket"
    />

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
        <input
          ref="importFileInput"
          type="file"
          accept=".txt,.dec,text/plain"
          class="hidden"
          @change="onImportFile"
        >
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-upload"
            class="mr-auto"
            @click="pickImportFile"
          >
            {{ t('build.importFile') }}
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-download"
            @click="downloadDecklist"
          >
            {{ t('build.downloadTxt') }}
          </UButton>
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
      @set-printing="onSetPrinting"
    />
  </div>
</template>

<style scoped>
/* The app shell runs in viewport-locked mode on this page (.app-shell--fullscreen),
   so .content is a bounded, non-scrolling box. The deck page fills it; the single
   toolbar row is fixed-height and the workspace flexes to take the rest. Result:
   the whole page + the footer fit on one screen — no page scroll; each workspace
   column scrolls internally only on genuine overflow. */
.deck-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.deck-tab {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.deck-workspace {
  flex: 1;
  min-height: 0;
  /* a sensible floor so very short viewports still show a usable area */
  --ws-min: 460px;
}
.ws-col {
  min-height: 0;
  height: 100%;
}
/* The panels inside are h-full with their own internal overflow, so a column
   only shows a scrollbar when its content genuinely exceeds the height. */
.ws-col > :deep(*) {
  height: 100%;
}

@media (max-width: 1023px) {
  /* Stacked on small screens: let the page flow naturally instead of trapping
     two scroll regions in a short viewport. */
  .deck-page,
  .deck-tab {
    display: block;
  }
  .deck-workspace {
    min-height: 0;
  }
  .ws-col,
  .ws-col > :deep(*) {
    height: auto;
  }
}
</style>
