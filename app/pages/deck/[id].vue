<script setup lang="ts">
import type { BuyLang } from '~/composables/useCardmarket'
import type { CategoryKey, ManaColor } from '~/composables/useMtg'
import type { PageFormat, PdfSettings } from '~/composables/usePdfExport'
import type { ResolvedCard, ScryfallCard } from '~/composables/useScryfall'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useCardmarket } from '~/composables/useCardmarket'
import { useDeckAnalysis } from '~/composables/useDeckAnalysis'
import { useDeckBuilder, validateCommander } from '~/composables/useDeckBuilder'
import { useDecklist } from '~/composables/useDecklist'
import { useDeckStore } from '~/composables/useDeckStore'
import { useManaIdentity } from '~/composables/useManaIdentity'
import { classifyType, displayName, displayType, englishTypeLine } from '~/composables/useMtg'
import { usePdfExport } from '~/composables/usePdfExport'
import { useScryfall } from '~/composables/useScryfall'

const route = useRoute()
const deckId = computed(() => route.params.id as string)

const { getDeck, updateDeck, setShare, ready: storeReady } = useDeckStore()
const { loggedIn } = useAuth()
const { parse, totalCards } = useDecklist()
const { fetchCollection } = useScryfall()
const { exportPdf } = usePdfExport()
const { searchUrl, linksForResolved, wantsListText, wantsListImportUrl } = useCardmarket()
const { identity, colorVar, accentStyle } = useManaIdentity()
const { typeStats, detectCommanderIndex, commanderColors, manaCurve, priceSummary } = useDeckAnalysis()
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
// Monotonic token: each loadCards() call claims the next value. A slower,
// superseded resolve (e.g. deck A still in-flight when we switch to B) checks
// its token before committing, so it can't clobber the current deck's cards.
let loadToken = 0
const fetchProgress = ref({ loaded: 0, total: 0 })
const exporting = ref<PageFormat | null>(null)
const exportProgress = ref({ loaded: 0, total: 0, phase: '' })

const activeTab = ref<'deck' | 'preview' | 'buy'>('deck')

// Coach IA slide-over open state. Esc closes it (bound only while open).
const coachOpen = ref(false)
function onCoachEsc(e: KeyboardEvent) {
  if (e.key === 'Escape')
    coachOpen.value = false
}
watch(coachOpen, (open) => {
  if (import.meta.client)
    open ? window.addEventListener('keydown', onCoachEsc) : window.removeEventListener('keydown', onCoachEsc)
})
onBeforeUnmount(() => {
  if (import.meta.client)
    window.removeEventListener('keydown', onCoachEsc)
})

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
  activeTab.value = 'deck'
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
// while building on the Deck tab). Re-resolves only when the list changed since
// the last load (resolvedDirty) or nothing is loaded yet.
watch(activeTab, (tab) => {
  if ((tab === 'preview' || tab === 'buy') && cardCount.value > 0
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

// Cardmarket marketplace language (which site locale to open links in). Cards
// are always matched by English name; this only changes the shop's UI language.
// Defaults to the site locale so a FR user lands on the FR marketplace.
const buyLang = ref<BuyLang>(locale.value === 'fr' ? 'fr' : 'en')

const cmLinks = computed(() => linksForResolved(
  resolvedCards.value.length
    ? resolvedCards.value
    : allEntries.value.map(e => ({ entry: e, card: null, imageUrl: null, backImageUrl: null, lang: 'en' })),
  buyLang.value,
))

// ---- Buy tab: per-card pricing rows + deck cost summary ----
interface BuyRow {
  name: string // localized display name
  enName: string // English name (for the Cardmarket search)
  quantity: number
  unit: number | null // EUR per copy (null = unknown)
  lineTotal: number | null
  url: string
  thumb: string | null
}
const buyRows = computed<BuyRow[]>(() => {
  const isFr = locale.value === 'fr'
  const rows: BuyRow[] = (resolvedCards.value.length
    ? resolvedCards.value
    : allEntries.value.map(e => ({ entry: e, card: null, imageUrl: null, backImageUrl: null, lang: 'en' } as ResolvedCard)))
    .map((rc) => {
      const enName = rc.card?.name ?? rc.entry.name
      const eur = rc.priceEur ?? rc.card?.prices?.eur
      const unit = eur ? Number.parseFloat(eur) : Number.NaN
      const hasPrice = Number.isFinite(unit)
      return {
        name: displayName(rc.card, isFr) || rc.entry.name,
        enName,
        quantity: rc.entry.quantity,
        unit: hasPrice ? unit : null,
        lineTotal: hasPrice ? Math.round(unit * rc.entry.quantity * 100) / 100 : null,
        url: searchUrl(enName, buyLang.value),
        thumb: rc.card?.image_uris?.small ?? rc.card?.card_faces?.[0]?.image_uris?.small ?? null,
      }
    })
  // Priced cards first (most expensive on top), then unknown-price cards by name.
  return rows.sort((a, b) => {
    if (a.lineTotal == null && b.lineTotal == null)
      return a.name.localeCompare(b.name)
    if (a.lineTotal == null)
      return 1
    if (b.lineTotal == null)
      return -1
    return b.lineTotal - a.lineTotal
  })
})
const buySummary = computed(() => {
  const total = price.value.total
  const priced = buyRows.value.filter(r => r.lineTotal != null)
  const units = priced.reduce((s, r) => s + r.quantity, 0)
  return {
    total,
    missing: price.value.missing,
    avg: units ? Math.round((total / units) * 100) / 100 : 0,
    priciest: priced[0] ?? null,
  }
})
function fmtEur(n: number): string {
  return `${n.toFixed(2)} €`
}

function openAllCardmarket() {
  // Browsers block all but the first popup from one gesture, so open the first
  // card and copy the rest of the links to the clipboard.
  const links = cmLinks.value
  if (!links.length)
    return
  window.open(links[0]!.url, '_blank')
  if (links.length > 1) {
    navigator.clipboard.writeText(links.map(l => l.url).join('\n'))
    toast.add({
      title: t('toast.linksCopied'),
      description: `${links.length} ${t('editor.cardsWord')}`,
      color: 'info',
      icon: 'i-lucide-clipboard-copy',
    })
  }
}

// Decklist entries with English names for Cardmarket (which matches by English
// name only). Prefers the resolved canonical name; falls back to the typed name
// when a card isn't resolved yet (e.g. a French entry the user hasn't loaded).
const enEntries = computed(() =>
  allEntries.value.map(e => ({ ...e, name: resolvedFor(e.name)?.card?.name ?? e.name })),
)

function copyWantsList() {
  navigator.clipboard.writeText(wantsListText(enEntries.value))
  toast.add({
    title: t('toast.listCopied'),
    description: t('toast.listCopiedDesc'),
    color: 'success',
    icon: 'i-lucide-clipboard-check',
  })
}

// One-step "buy the whole deck": copy the Cardmarket-formatted wants list to the
// clipboard, then open Cardmarket's wants-list import page — the user pastes once
// and Cardmarket builds the buyable list (closest to 1-click without a partner API).
function buyWholeDeck() {
  navigator.clipboard.writeText(wantsListText(enEntries.value)).catch(() => {})
  window.open(wantsListImportUrl(buyLang.value), '_blank')
  toast.add({
    title: t('buy.wantsCopiedTitle'),
    description: t('buy.wantsCopiedDesc'),
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
  trigger: 'data-[state=active]:text-(--accent-text) text-(--color-text-mid) font-medium',
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
        :aria-label="t('nav.backToDecks')"
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

      <!-- Share (cloud decks only) -->
      <UButton
        v-if="loggedIn"
        icon="i-lucide-share-2"
        color="neutral"
        variant="subtle"
        size="sm"
        :loading="sharing"
        class="shrink-0"
        @click="shareDeck"
      >
        <span class="hidden sm:inline">{{ t('share.button') }}</span>
      </UButton>
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
            @click="loadCards()"
          >
            <span v-if="fetching">{{ fetchProgress.loaded }}/{{ fetchProgress.total }}</span>
            <span v-else>{{ t('build.resolve') }}</span>
          </UButton>
        </div>

        <!-- Coach IA: always-visible trigger; opens a side panel (slide-over) so
             the chat is reachable without being pushed below the deck list. -->
        <button
          type="button"
          class="accent-border-c accent-soft-bg flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium text-(--accent-text) transition-all hover:-translate-y-px hover:bg-[rgba(var(--accent-rgb),0.2)]"
          @click="coachOpen = true"
        >
          <span class="leading-none">✦</span>
          {{ t('coach.open') }}
        </button>
      </div>

      <div
        class="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(340px,420px)]"
        style="min-height: 70vh"
      >
        <BuilderCardSearchPanel
          :identity="identityLocked ? builderIdentity : null"
          :in-deck="inDeckNames"
          :commander-name="commanderName || builder.commanderName.value"
          :commander-en-name="commanderEnName"
          @add="addSearchCard"
          @remove="removeSearchCard"
          @details="openSearchDetail"
        />
        <div class="space-y-6">
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
          />
        </div>
      </div>

      <!-- Coach IA — slide-over panel (teleported, never clipped, doesn't steal
           the deck list's height). Opened by the toolbar button or ⌘K. -->
      <Teleport to="body">
        <Transition name="coach-slide">
          <div
            v-if="coachOpen"
            class="fixed inset-0 z-[var(--z-modal)] flex justify-end"
          >
            <div class="coach-scrim absolute inset-0" @click="coachOpen = false" />
            <div class="relative z-10 flex h-full w-full max-w-[440px] flex-col p-3">
              <BuilderCoachChat
                :deck-context="coachContext"
                :ready="aiCardNames.length > 0"
                class="h-full !max-h-none"
                @close="coachOpen = false"
              />
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>

    <!-- PREVIEW TAB -->
    <div v-show="activeTab === 'preview'">
      <!-- Loading state: images resolve automatically on entering this tab. -->
      <div
        v-if="resolvedCards.length === 0 && fetching"
        class="glass mx-auto flex max-w-md flex-col items-center rounded-[var(--radius-2xl)] py-16 text-center"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="mb-3 h-10 w-10 animate-spin text-(--accent-text)"
        />
        <p class="font-mono text-sm text-(--color-text-muted)">
          {{ fetchProgress.loaded }} / {{ fetchProgress.total }}
        </p>
      </div>

      <!-- Empty deck: nothing to resolve. -->
      <div
        v-else-if="resolvedCards.length === 0"
        class="glass mx-auto flex max-w-md flex-col items-center rounded-[var(--radius-2xl)] py-16 text-center"
      >
        <UIcon
          name="i-lucide-image-off"
          class="mb-3 h-12 w-12 text-(--color-text-muted)"
        />
        <p class="text-(--color-text-muted)">
          {{ t('editor.noCards') }}
        </p>
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

          <!-- Type stats — click a type to filter the grid below. -->
          <div
            v-if="stats.length"
            class="glass-solid rounded-[var(--radius-xl)] p-4"
          >
            <div class="mb-3 flex items-center justify-between">
              <h3 class="font-mono text-[11px] uppercase tracking-[2px] text-(--color-text-muted)">
                {{ t('stats.title') }}
              </h3>
              <button
                v-if="typeFilter"
                type="button"
                class="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-(--accent-text) hover:underline"
                @click="typeFilter = null"
              >
                <UIcon name="i-lucide-x" class="h-3 w-3" />
                {{ t('stats.clearFilter') }}
              </button>
            </div>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                v-for="s in stats"
                :key="s.key"
                type="button"
                class="flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left ring-1 transition-all"
                :class="typeFilter === s.key
                  ? 'accent-soft-bg ring-(--accent-border)'
                  : 'bg-(--color-surface-2)/50 ring-transparent hover:bg-(--color-surface-2)'"
                :aria-pressed="typeFilter === s.key"
                @click="toggleTypeFilter(s.key)"
              >
                <UIcon
                  :name="s.icon"
                  class="h-4 w-4 shrink-0"
                  :class="typeFilter === s.key ? 'text-(--accent-text)' : 'text-(--color-text-muted)'"
                />
                <div class="min-w-0">
                  <div class="font-mono text-sm font-semibold text-(--color-text-high)">
                    {{ s.count }}
                  </div>
                  <div class="truncate text-[10px] text-(--color-text-muted)">
                    {{ t(`type.${s.key}`) }}
                  </div>
                </div>
              </button>
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
            <!-- Active filter banner -->
            <div
              v-if="typeFilter"
              class="mb-3 flex items-center gap-2 font-mono text-xs text-(--color-text-muted)"
            >
              <UIcon name="i-lucide-filter" class="h-3.5 w-3.5 text-(--accent-text)" />
              <span>
                {{ filteredGridCards.length }} · {{ t(`type.${typeFilter}`) }}
              </span>
              <button
                type="button"
                class="text-(--accent-text) hover:underline"
                @click="typeFilter = null"
              >
                {{ t('stats.clearFilter') }}
              </button>
            </div>
            <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              <MtgCardPreview
                v-for="(card, idx) in pagedCards"
                :key="card.card?.id ?? card.entry.name"
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
                :aria-label="t('preview.prevPage')"
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
                :aria-label="t('preview.nextPage')"
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
      <!-- Loading -->
      <div
        v-if="resolvedCards.length === 0 && fetching"
        class="glass flex items-center justify-center gap-3 rounded-[var(--radius-xl)] py-12"
      >
        <UIcon name="i-lucide-loader-circle" class="h-6 w-6 animate-spin text-(--accent-text)" />
        <span class="font-mono text-sm text-(--color-text-muted)">{{ fetchProgress.loaded }} / {{ fetchProgress.total }}</span>
      </div>

      <template v-else>
        <!-- Cost summary -->
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div class="glass-solid rounded-[var(--radius-xl)] p-4">
            <div class="mb-1 font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
              {{ t('buy.estTotal') }}
            </div>
            <div class="font-display text-2xl font-bold text-(--accent-text)">
              {{ fmtEur(buySummary.total) }}
            </div>
          </div>
          <div class="glass-solid rounded-[var(--radius-xl)] p-4">
            <div class="mb-1 font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
              {{ t('buy.avgPerCard') }}
            </div>
            <div class="font-display text-2xl font-bold text-(--color-text-high)">
              {{ fmtEur(buySummary.avg) }}
            </div>
          </div>
          <div class="glass-solid rounded-[var(--radius-xl)] p-4">
            <div class="mb-1 font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
              {{ t('buy.uniqueCards') }}
            </div>
            <div class="font-display text-2xl font-bold text-(--color-text-high)">
              {{ buyRows.length }}
            </div>
          </div>
          <div class="glass-solid rounded-[var(--radius-xl)] p-4">
            <div class="mb-1 font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
              {{ t('buy.noPrice') }}
            </div>
            <div
              class="font-display text-2xl font-bold"
              :class="buySummary.missing ? 'text-(--color-warning)' : 'text-(--color-text-high)'"
            >
              {{ buySummary.missing }}
            </div>
          </div>
        </div>

        <!-- One-step buy the whole deck -->
        <div class="glass rounded-[var(--radius-xl)] p-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <div class="font-display font-semibold text-(--color-text-high)">
                {{ t('buy.wholeDeckTitle') }}
              </div>
              <p class="mt-0.5 text-sm text-(--color-text-mid)">
                {{ t('buy.wholeDeckHint') }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-3">
              <!-- Cardmarket marketplace language -->
              <div
                class="flex items-center overflow-hidden rounded-[var(--radius-md)] border border-(--color-border-strong)"
                role="group"
                :aria-label="t('buy.langLabel')"
              >
                <button
                  v-for="opt in (['fr', 'en'] as const)"
                  :key="opt"
                  type="button"
                  class="px-2.5 py-1.5 font-mono text-xs font-semibold uppercase transition-colors"
                  :class="buyLang === opt
                    ? 'accent-soft-bg text-(--accent-text)'
                    : 'text-(--color-text-muted) hover:text-(--color-text-high)'"
                  :aria-pressed="buyLang === opt"
                  @click="buyLang = opt"
                >
                  {{ opt }}
                </button>
              </div>
              <UButton
                icon="i-lucide-shopping-cart"
                color="primary"
                variant="solid"
                size="lg"
                class="font-medium tracking-wide neon-ring"
                @click="buyWholeDeck"
              >
                {{ t('buy.wholeDeck') }}
              </UButton>
            </div>
          </div>
          <!-- Secondary actions -->
          <div class="mt-3 flex flex-wrap gap-2 border-t border-(--color-border-subtle) pt-3">
            <UButton
              icon="i-lucide-clipboard-copy"
              color="neutral"
              variant="ghost"
              size="sm"
              class="bg-(--color-surface-2) text-(--color-text-high) ring-1 ring-(--color-border-strong) hover:bg-(--color-surface-3)"
              @click="copyWantsList"
            >
              {{ t('buy.copyWants') }}
            </UButton>
            <UButton
              icon="i-lucide-external-link"
              color="neutral"
              variant="ghost"
              size="sm"
              class="bg-(--color-surface-2) text-(--color-text-high) ring-1 ring-(--color-border-strong) hover:bg-(--color-surface-3)"
              @click="openAllCardmarket"
            >
              {{ t('buy.openCards') }}
            </UButton>
          </div>
        </div>

        <!-- Priced list -->
        <div
          v-if="buyRows.length"
          class="glass-solid overflow-hidden rounded-[var(--radius-xl)]"
        >
          <!-- header -->
          <div class="flex items-center gap-3 border-b border-(--color-border-strong) bg-(--color-surface-2)/60 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
            <span class="w-7" />
            <span class="flex-1">{{ t('buy.card') }}</span>
            <span class="w-14 text-right">{{ t('buy.unit') }}</span>
            <span class="w-10 text-center">{{ t('buy.qty') }}</span>
            <span class="w-16 text-right">{{ t('buy.lineTotal') }}</span>
            <span class="w-8" />
          </div>
          <div
            v-for="row in buyRows"
            :key="row.enName"
            class="flex items-center gap-3 border-b border-(--color-border-subtle) px-4 py-2 transition-colors last:border-0 hover:bg-(--color-surface-2)/40"
          >
            <img
              v-if="row.thumb"
              :src="row.thumb"
              :alt="row.name"
              loading="lazy"
              class="h-9 w-7 shrink-0 rounded object-cover ring-1 ring-black/30"
            >
            <span
              v-else
              class="h-9 w-7 shrink-0 rounded bg-(--color-surface-2)"
            />
            <span class="flex-1 truncate text-sm text-(--color-text-high)">{{ row.name }}</span>
            <span
              class="w-14 text-right font-mono text-xs"
              :class="row.unit == null ? 'text-(--color-text-disabled)' : 'text-(--color-text-mid)'"
            >{{ row.unit == null ? '—' : fmtEur(row.unit) }}</span>
            <span class="w-10 text-center font-mono text-xs text-(--color-text-muted)">×{{ row.quantity }}</span>
            <span
              class="w-16 text-right font-mono text-sm font-semibold"
              :class="row.lineTotal == null ? 'text-(--color-text-disabled)' : 'text-(--accent-text)'"
            >{{ row.lineTotal == null ? '—' : fmtEur(row.lineTotal) }}</span>
            <UButton
              :to="row.url"
              target="_blank"
              icon="i-lucide-external-link"
              color="neutral"
              variant="ghost"
              size="xs"
              class="w-8 shrink-0"
              :aria-label="`Cardmarket — ${row.name}`"
            />
          </div>
        </div>
        <p class="px-1 font-mono text-[10px] text-(--color-text-muted)">
          {{ t('buy.priceNote') }}
        </p>
      </template>
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
