<script setup lang="ts">
import type { ResolvedRow } from '~/composables/scryfall/toResolved'
import type { CategoryKey, ManaColor } from '~/composables/useMtg'
import type { ResolvedCard, ScryfallCard } from '~/composables/useScryfall'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { deckPath } from '#shared/game'
import { useDeckAnalysis } from '~/composables/useDeckAnalysis'
import { useDeckBuilder, validateCommander } from '~/composables/useDeckBuilder'
import { useDeckBuy } from '~/composables/useDeckBuy'
import { useDeckExport } from '~/composables/useDeckExport'
import { useDecklist } from '~/composables/useDecklist'
import { useDeckPrintings } from '~/composables/useDeckPrintings'
import { useDeckStore } from '~/composables/useDeckStore'
import { useManaIdentity } from '~/composables/useManaIdentity'
import { classifyType, displayName, displayType, isTokenType } from '~/composables/useMtg'
import { useResolvedCards } from '~/composables/useResolvedCards'
import { getImageUris, mtgRaw, toMtgCard } from '~/composables/useScryfall'
import { isCardWithinIdentity } from '~/utils/mtgValidation'

// The deck page has heavy async setup; with the global `cine` out-in page
// transition + Nuxt's Suspense, SPA navigation here resolved the component but
// never MOUNTED it (blank page, onMounted never fired). Opting this route out of
// the page transition fixes it — the deck opens reliably on client navigation.
//
// Magic lives at night: the universe and its forced dark mode are page meta.
definePageMeta({ pageTransition: false, universe: 'mtg', colorMode: 'dark' })
const route = useRoute()
const router = useRouter()
const deckId = computed(() => route.params.id as string)

const { getDeck, ready: storeReady } = useDeckStore()
const { loggedIn } = useAuth()
const { parse, totalCards } = useDecklist()
const { identity, colorVar } = useManaIdentity()
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

// Card-resolution engine: resolvedCards, fetching/progress, the dirty flag, the
// monotonic-token loadCards(), and the name→card lookup. Lives in a composable
// (see useResolvedCards) — the page just feeds it its live computeds as getters
// and resets pagination on each resolve start (preserves `page.value = 1`).
const {
  resolvedCards,
  fetching,
  fetchProgress,
  resolvedDirty,
  loadCards,
  resolvedByName,
  resolvedFor,
} = useResolvedCards({
  // eslint-disable-next-line ts/no-use-before-define
  allEntries: () => allEntries.value,
  // eslint-disable-next-line ts/no-use-before-define
  cardCount: () => cardCount.value,
  lang: () => lang.value,
  t,
  // eslint-disable-next-line ts/no-use-before-define
  onLoadStart: () => { page.value = 1 },
})

// Card language follows the site locale — re-resolve on toggle so names,
// oracle text, images, and prices actually switch instead of staying pinned
// to whichever language was active when the deck was first opened (affects
// the grid, Preview, Buy tab, PDF export, and the FR-count badge).
watch(lang, () => {
  // eslint-disable-next-line ts/no-use-before-define
  if (cardCount.value > 0)
    loadCards({ silent: true })
})

// Overlay open-state (Preview / Buy / Coach) + Esc-to-close + ?preview/?buy
// deep-link sync. The page opens them (toolbar, deep-link in initDeck). See
// useDeckOverlays.
const { previewOpen, buyOpen, coachOpen } = useDeckOverlays(route, router)
// Coach large-panel toggle (shared state; the header button lives in CoachChat).
const coachExpanded = useCoachExpanded()

// The Preview overlay pulls in jsPDF/html2canvas/canvg/marked/dompurify (~590 KB
// gzip ~190 KB) — load that chunk only once the panel is actually opened, not on
// every deck-page visit. Once loaded it stays mounted (never gated back to
// false) so its internal open/close <Transition> keeps animating normally on
// every subsequent toggle.
const previewLoaded = ref(false)
watch(previewOpen, (v) => {
  if (v)
    previewLoaded.value = true
})

// The import/export dialog is the shell's own (DeckIoModal): this deck
// registers itself as its target while it is on screen, so the dialog can
// replace the open list and hand it out for copy, download or file.
const importOverlay = useImportOverlay()
onMounted(() => importOverlay.registerTarget({
  game: 'mtg',
  name: () => deckName.value,
  read: () => rawDecklist.value,
  write: (raw) => { rawDecklist.value = raw },
}))
onBeforeUnmount(() => importOverlay.clearTarget())

// Share settings (DeckShareModal) and, for a guest, the sign-up offer.
const showShareModal = ref(false)
const showSaveWall = ref(false)

// Pagination state (declared early: builder ops reset the page on commander change).
const PAGE_SIZE = 24
const page = ref(1)

// ---- Builder (edits the deck on top of rawDecklist) ----
const builder = useDeckBuilder({
  get: () => rawDecklist.value,
  set: (v) => { rawDecklist.value = v },
})
// Reload the builder's structured view whenever the raw text changes from elsewhere
// (initial mount, paste in the Edit tab, import). Guard against feedback loops:
// builder.serialise() sets rawDecklist, which we don't want to echo back as a reload.
// Re-entrancy depth, not a boolean: nested builderOp calls (or overlapping ops
// before the nextTick flush) each inc/dec, so the guard can't be cleared early
// by a sibling op while another is still pending.
let writeDepth = 0
// Cards added, removed or re-pinned are resolved shortly after the edit (only
// the ones not seen yet reach the server), so thumbnails, groups, prices and
// the curve follow every change.
let resolveTimer: ReturnType<typeof setTimeout> | null = null
watch(rawDecklist, () => {
  resolvedDirty.value = true
  if (resolveTimer)
    clearTimeout(resolveTimer)
  resolveTimer = setTimeout(loadCards, 350, { silent: true })
  if (writeDepth > 0)
    return
  builder.load()
})
onBeforeUnmount(() => resolveTimer && clearTimeout(resolveTimer))
function builderOp(fn: () => void) {
  writeDepth++
  fn()
  // The rawDecklist watcher flushes asynchronously, so only release this op's
  // depth after that flush — otherwise builder writes would reload (and clobber)
  // the very edit we just made.
  nextTick(() => (writeDepth--))
}

// Names already in the deck (lowercased) — for the search "added" state.
const inDeckNames = computed(() => new Set(builder.entries.value.map(e => e.name.trim().toLowerCase())))

// Maps derived from resolved cards (when loaded) for grouping + EDH validation.
const categoryByName = computed(() => {
  const m = new Map<string, string>()
  for (const rc of resolvedCards.value)
    m.set(rc.entry.name.trim().toLowerCase(), classifyType(rc.card?.typeLine ?? ''))
  return m
})
const identityByName = computed(() => {
  const m = new Map<string, string[]>()
  for (const rc of resolvedCards.value) {
    if (rc.card)
      m.set(rc.entry.name.trim().toLowerCase(), rc.card.colorIdentity)
  }
  return m
})
// name(lower) → localized display name (FR printed name when the site is FR).
const displayNameByName = computed(() => {
  const m = new Map<string, string>()
  const isFr = locale.value === 'fr'
  for (const rc of resolvedCards.value) {
    if (rc.card)
      m.set(rc.entry.name.trim().toLowerCase(), displayName(mtgRaw(rc.card), isFr))
  }
  return m
})
// name(lower) → { thumbnail, large image, mana cost } for the enriched deck rows.
const cardMetaByName = computed(() => {
  const m = new Map<string, { thumb: string | null, image: string | null, manaCost: string }>()
  for (const rc of resolvedCards.value) {
    const c = mtgRaw(rc.card)
    if (!c)
      continue
    const uris = getImageUris(c)
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
  const allowed = commander.value?.card?.colorIdentity
  if (!identityLocked.value || !allowed)
    return true
  return isCardWithinIdentity(card, allowed.map(c => c.toLowerCase()))
}

// Auto-add the token(s) a card creates (Scryfall's all_parts, component
// 'token') — skips tokens already in the deck. Added by name (like the
// drag-drop fallback below) rather than pre-fetching each token's exact
// printing: token art rarely matters for a proxy sheet, and this reuses the
// normal resolution path instead of a bespoke fetch.
//
// Cards served from the local database always carry `all_parts`, at oracle
// level, whatever the printing's language. Only results of a raw Scryfall-syntax
// search still come straight from Scryfall, which attaches the field to the
// default printing alone — for those, look the tokens up locally by canonical
// name.
async function addAssociatedTokens(card: ScryfallCard) {
  let allParts = card.all_parts
  if (!allParts) {
    try {
      const { cards } = await $fetch<{ cards: ResolvedRow[] }>('/api/cards/resolve', {
        method: 'POST',
        body: { lang: 'en', entries: [{ name: card.name }] },
      })
      allParts = cards[0]?.card?.all_parts
    }
    catch {
      return // best-effort: skip token auto-add on a network hiccup
    }
  }
  const tokenNames = (allParts ?? [])
    .filter(p => p.component === 'token')
    .map(p => p.name.trim())
    .filter((name, i, arr) => name && !inDeckNames.value.has(name.toLowerCase()) && arr.indexOf(name) === i)
  for (const name of tokenNames)
    builderOp(() => builder.addCard(name))
  if (tokenNames.length) {
    toast.add({
      title: t('toast.tokensAdded'),
      description: tokenNames.join(', '),
      color: 'info',
      icon: 'i-lucide-copy-plus',
    })
  }
}
function addSearchCard(card: ScryfallCard) {
  if (!isWithinIdentity(card)) {
    toast.add({ title: t('toast.outOfIdentity'), description: card.name, color: 'warning', icon: 'i-lucide-shield-alert' })
    return
  }
  builderOp(() => builder.addScryfallCard(card))
  toast.add({ title: t('toast.added'), description: card.name, color: 'success', icon: 'i-lucide-plus' })
  addAssociatedTokens(card)
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
async function onDropAdd(name: string) {
  const key = name.trim().toLowerCase()
  if (inDeckNames.value.has(key))
    return
  // A search card is not resolved yet: fetch it, so the identity lock and the
  // tokens apply as they do for the add button.
  let card = mtgRaw(resolvedByName.value.get(key)?.card)
  if (!card) {
    try {
      const { cards } = await $fetch<{ cards: ResolvedRow[] }>('/api/cards/resolve', {
        method: 'POST',
        body: { lang: lang.value, entries: [{ name }] },
      })
      card = cards[0]?.card ?? null
    }
    catch {
      // Unreachable server: the card is added by name below.
    }
  }
  if (card) {
    addSearchCard(card)
    return
  }
  builderOp(() => builder.addCard(name))
  toast.add({ title: t('toast.added'), description: name, color: 'success', icon: 'i-lucide-plus' })
}
// Drop a DECK card onto the search panel → remove it.
function onDropRemove(name: string) {
  builderOp(() => builder.removeCard(name))
  toast.add({ title: t('toast.removed'), description: name, color: 'neutral', icon: 'i-lucide-minus' })
}

// ---- AI assistance ----
// English card names (prefers the resolved canonical name) — sent to the Coach
// as deck context so its Scryfall/EDHREC tools resolve them.
const aiCardNames = computed(() => builder.entries.value.map(e => resolvedFor(e.name)?.card?.name ?? e.name))
// Single entry point for picking a commander: keep the builder's commander name
// and the resolved-card override in sync so theme/featured/validation all agree.
function chooseCommander(name: string) {
  // Stored by name in the list's Commander section (see useDeckBuilder), so it
  // survives edits above it, a reload and a deck switch.
  builderOp(() => builder.setCommander(name))
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
  // priceEur must be set here: the detail modal used to fall back to the raw
  // card's price, and this is the one ResolvedCard built outside resolveBatch.
  openDetail({
    entry: { quantity: 1, name: c.name },
    card: toMtgCard(c),
    imageUrl: front,
    backImageUrl: back,
    lang: c.lang,
    priceEur: c.prices?.eur ?? null,
  })
}

// Open the detail modal for a deck-list row (clicked by name). Uses the resolved
// card when available, else a minimal entry so the modal still opens.
function openDeckEntryDetail(name: string) {
  const rc = resolvedFor(name)
  openDetail(rc ?? { entry: { quantity: 1, name }, card: null, imageUrl: null, backImageUrl: null, lang: lang.value })
}

// ---- Undo/redo and autosave ----
// Shared with the One Piece page: one snapshot per settled edit of the list
// and the name, bound to the deck being edited, Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z.
const autosave = useDeckAutosave({ deckId, raw: rawDecklist, name: deckName })

// Init / re-init per deck. Vue Router REUSES this component when only the
// :id param changes, so a watch (not onMounted) is required — otherwise
// navigating deck A→B would leave A's state in place and autosave A into B.
function initDeck(id: string) {
  // Persist any edits to the deck we're leaving BEFORE we overwrite the refs
  // below; otherwise a fast A→B switch drops A's last (still-debounced) changes.
  autosave.flush()
  const d = getDeck(id)
  if (!d) {
    // Only redirect once the store has finished loading. For a signed-in user
    // arriving via direct navigation/refresh, the cloud decks load async — bailing
    // before storeReady would bounce them home before their deck even arrives.
    if (storeReady.value)
      navigateTo('/decks')
    return
  }
  // A One Piece deck opened through a Magic URL goes to its own universe.
  if (d.game !== 'mtg') {
    navigateTo(deckPath(d), { replace: true })
    return
  }
  autosave.reset({ raw: d.raw, name: d.name })
  rawDecklist.value = d.raw
  deckName.value = d.name
  resolvedCards.value = []
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
  // and the commander right away (one /api/cards/resolve call for the deck).
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

// Signing out, or deleting the deck in another tab, takes it away: back to the list.
watch(() => getDeck(deckId.value), (now, before) => {
  if (!now && before && storeReady.value)
    navigateTo('/decks')
})

// Schedule a save whenever the user edits the name or list; the programmatic
// assignment done by initDeck changes nothing and is skipped.
watch([rawDecklist, deckName], autosave.schedule)

// Flush any pending save when leaving the page entirely.

const parsed = computed(() => rawDecklist.value.trim() ? parse(rawDecklist.value) : null)
const allEntries = computed(() => parsed.value ? [...parsed.value.mainboard, ...parsed.value.sideboard] : [])
const cardCount = computed(() => parsed.value ? totalCards(parsed.value.mainboard) + totalCards(parsed.value.sideboard) : 0)

// Tokens are printed with the deck but are not part of the hundred, nor bought.
const tokenNames = computed(() => new Set(resolvedCards.value
  .filter(rc => isTokenType(rc.card?.typeLine ?? ''))
  .map(rc => rc.entry.name.trim().toLowerCase())))
const tokenCount = computed(() => builder.entries.value
  .filter(e => tokenNames.value.has(e.name.trim().toLowerCase()))
  .reduce((n, e) => n + e.quantity, 0))
const deckSize = computed(() => cardCount.value - tokenCount.value)
const buyableCards = computed(() => resolvedCards.value.filter(rc => !tokenNames.value.has(rc.entry.name.trim().toLowerCase())))
const buyableEntries = computed(() => allEntries.value.filter(e => !tokenNames.value.has(e.name.trim().toLowerCase())))

const successCards = computed(() => resolvedCards.value.filter(c => c.imageUrl))
const errorCards = computed(() => resolvedCards.value.filter(c => !c.imageUrl))
const frCount = computed(() => resolvedCards.value.filter(c => c.lang === 'fr').length)

// ---- Commander + dynamic theme ----
// The chosen commander, found by name; without a choice, the first card that
// can lead. A chosen card still resolving has no card to show yet.
const commanderIndex = computed(() => {
  const chosen = builder.commanderName.value.trim().toLowerCase()
  if (!chosen)
    return detectCommanderIndex(resolvedCards.value)
  return resolvedCards.value.findIndex(rc =>
    rc.entry.name.trim().toLowerCase() === chosen || rc.card?.name.trim().toLowerCase() === chosen)
})
const commander = computed(() =>
  commanderIndex.value >= 0 ? resolvedCards.value[commanderIndex.value] : null,
)

// Locale-aware commander name + type line.
const commanderName = computed(() => {
  const c = commander.value?.card
  if (!c)
    return commander.value?.entry.name ?? ''
  return displayName(mtgRaw(c), locale.value === 'fr')
})
// Canonical English commander name — EDHREC only knows English names, so the
// suggestions lookup must use this, never the localized display name.
const commanderEnName = computed(() =>
  commander.value?.card?.name ?? (builder.commanderName.value || commanderName.value),
)
const commanderType = computed(() => displayType(mtgRaw(commander.value?.card), locale.value === 'fr'))

// Theme colors: from commander if resolved, else from decklist heuristic, else neutral.
const { themeColors, themeStyle } = useDeckTheme(() =>
  commander.value?.card ? commanderColors(commander.value.card) : identity(rawDecklist.value),
)

// Toolbar dots in the commander's colours, and the guest save summary.
const toolbarDots = computed(() => themeColors.value.map(colorVar))
const saveSummary = computed(() => {
  const head = commanderName.value || builder.commanderName.value
  return head ? `${deckSize.value} ${t('dash.cards')} · ${head}` : `${deckSize.value} ${t('dash.cards')}`
})

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
  tokenNames: tokenNames.value,
  identityByName: identityByName.value,
  commanderIdentity: commander.value?.card?.colorIdentity,
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
    const id = rc.card?.colorIdentity ?? []
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
  return gridCards.value.filter(rc => classifyType(rc.card?.typeLine ?? '') === typeFilter.value)
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

// Artworks: a pick in the detail view (the modal stays open, the toast undoes),
// the preview grid's ‹ › browsing and the deck-wide actions. See useDeckPrintings.
const {
  setPrinting: onSetPrinting,
  cyclePrint,
  pendingImages,
  deckSets,
  deckPrintsLoading,
  loadDeckPrints,
  applyBulk,
} = useDeckPrintings({
  entries: () => builder.entries.value,
  setPrintings: pins => builder.setPrintings(pins),
  builderOp,
  resolvedCards,
  lang: () => lang.value,
  t,
})
// The open detail view follows the deck: after a pick re-resolves, it shows the
// card as the deck now has it (new art, price, set line).
watch(resolvedCards, () => {
  if (!showDetail.value || !detailCard.value)
    return
  const rc = resolvedFor(detailCard.value.entry.name)
  if (rc && rc.entry.name === detailCard.value.entry.name && rc !== detailCard.value)
    detailCard.value = rc
})

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
} = useDeckBuy({ resolvedCards: buyableCards, allEntries: buyableEntries, price, resolvedFor, locale: lang })
</script>

<template>
  <div
    v-if="deck"
    class="deck-page fade-up"
    :style="themeStyle"
  >
    <!-- UNIFIED TOOLBAR — back · title + pips + cost · actions (see DeckToolbar). -->
    <BuilderDeckToolbar
      v-model:deck-name="deckName"
      :dots="toolbarDots"
      :card-count="deckSize"
      :price-total="price.total"
      :logged-in="loggedIn"
      :can-undo="autosave.canUndo.value"
      :can-redo="autosave.canRedo.value"
      printable
      buyable
      @open-import-export="importOverlay.show({ fromTarget: true })"
      @share="showShareModal = true"
      @save="showSaveWall = true"
      @open-preview="previewOpen = true"
      @open-buy="buyOpen = true"
      @undo="autosave.undo"
      @redo="autosave.redo"
    />

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
            :total="builder.totalCards.value - tokenCount"
            :commander-name="commanderName || builder.commanderName.value"
            :commander-raw-name="commanderEnName"
            :commander-image="commander?.imageUrl ?? null"
            :commander-type="commanderType"
            :commander-colors="themeColors"
            :resolving="fetching"
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
      <!-- Members only: the Coach needs an account (the route refuses a
           guest), so a visitor is never shown a chat they cannot use. -->
      <Teleport v-if="loggedIn" to="body">
        <div class="coach-fab">
          <!-- Panel stays mounted (v-show) so minimising never interrupts an
               in-flight reply or loses scroll position; only its visibility
               toggles. -->
          <Transition name="coach-pop">
            <div v-show="coachOpen" class="coach-panel" :class="{ 'coach-panel--lg': coachExpanded }">
              <BuilderCoachChat
                :deck-context="coachContext"
                :deck-id="deckId"
                :deck-name="deckName"
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

    <!-- PREVIEW & PRINT — right slide-over (review visually + export PDF).
         Lazy: this pulls in jsPDF/html2canvas/canvg — see previewLoaded above. -->
    <LazyBuilderDeckPreviewOverlay
      v-if="previewLoaded"
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
      :pending-images="pendingImages"
      :art-sets="deckSets"
      :art-loading="deckPrintsLoading"
      @details="openDetail"
      @toggle-type-filter="toggleTypeFilter"
      @export="doExport"
      @cycle-print="cyclePrint"
      @bulk-art="applyBulk"
      @load-art-sets="loadDeckPrints"
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

    <!-- Share settings: private link + public Discover listing -->
    <DeckShareModal v-model:open="showShareModal" :deck="deck" />

    <!-- A guest's save: the deck is already local, the account is offered. -->
    <DeckSaveWall
      v-model:open="showSaveWall"
      :deck-name="deckName"
      :summary="saveSummary"
      universe="mtg"
    />

    <!-- Card detail modal -->
    <CardDetailModal
      v-model:open="showDetail"
      :card="detailCard"
      :is-commander="!!detailCard && !!commander && detailCard.entry.name === commander.entry.name"
      :in-deck="!!detailCard && inDeckNames.has(detailCard.entry.name.trim().toLowerCase())"
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
