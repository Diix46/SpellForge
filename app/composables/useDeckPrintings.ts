import type { Ref } from 'vue'
import type { BulkArtMode, PrintOption, SetCoverage } from '#shared/mtg/prints'
import type { DeckEntry } from '~/composables/useDecklist'
import type { ResolvedCard } from '~/composables/useScryfall'
import { ref, watch } from 'vue'
import { displayable, pickPrint, pinFor, pinPrintKey, printKey, samePin, setCoverage } from '#shared/mtg/prints'
import { usePrintings } from '~/composables/usePrintings'
import { mtgRaw } from '~/composables/useScryfall'

interface Pin { name: string, set?: string, collectorNumber?: string, lang?: 'en' }

interface DeckPrintingsCtx {
  /** The builder's working entries (their set/number are the pins). */
  entries: () => DeckEntry[]
  setPrintings: (pins: Pin[]) => number
  /** The page's guarded write (see builderOp): keeps the edit from being reloaded over. */
  builderOp: (fn: () => void) => void
  resolvedCards: Ref<ResolvedCard[]>
  lang: () => 'en' | 'fr'
  t: (key: string) => string
}

const norm = (name: string) => name.trim().toLowerCase()

/**
 * Everything that changes a deck's artworks: a pick in the detail view (with
 * undo), the preview grid's ‹ › browsing, and the deck-wide actions. Pins are
 * the entries' `(SET) NUM`, written through the builder like any other edit, so
 * autosave and Ctrl+Z see them too.
 */
export function useDeckPrintings(ctx: DeckPrintingsCtx) {
  const { printsOf, printsOfMany } = usePrintings()
  const toast = useToast()

  function pinOf(name: string): Pin {
    const e = ctx.entries().find(x => norm(x.name) === norm(name))
    return { name, set: e?.set, collectorNumber: e?.collectorNumber, lang: e?.lang }
  }

  function write(pins: Pin[]): number {
    let changed = 0
    ctx.builderOp(() => {
      changed = ctx.setPrintings(pins)
    })
    return changed
  }

  // ---- A pick in the detail view ----
  function setPrinting(p: Pin) {
    const before = pinOf(p.name)
    if (samePin(before, p))
      return
    if (!write([p]))
      return
    toast.add({
      title: p.set ? ctx.t('toast.printSet') : ctx.t('toast.printAuto'),
      description: p.set ? `${p.set.toUpperCase()} #${p.collectorNumber}${p.lang === 'en' ? ' · EN' : ''}` : undefined,
      icon: 'i-lucide-layers',
      color: 'success',
      actions: [{ label: ctx.t('build.undo'), onClick: () => { write([before]) } }],
    })
  }

  // ---- ‹ › browsing in the preview grid ----
  // The image of a printing just stepped to, shown before the deck re-resolves
  // (350 ms debounce + the request), keyed by entry name.
  const pendingImages = ref(new Map<string, { key: string, image: string }>())
  watch(ctx.resolvedCards, (cards) => {
    if (!pendingImages.value.size)
      return
    const next = new Map(pendingImages.value)
    for (const rc of cards) {
      const pending = next.get(norm(rc.entry.name))
      const c = mtgRaw(rc.card)
      if (pending && c && printKey(c.set, c.collector_number, c.lang) === pending.key)
        next.delete(norm(rc.entry.name))
    }
    pendingImages.value = next
  })

  // Steps run one after another: two quick clicks must move two printings, and
  // each reads the pin the previous one wrote.
  let queue = Promise.resolve()
  function cyclePrint(card: ResolvedCard, dir: 1 | -1) {
    queue = queue.then(() => step(card, dir)).catch(() => {})
  }
  async function step(card: ResolvedCard, dir: 1 | -1) {
    const name = card.entry.name
    const lang = ctx.lang()
    const all = await printsOf(mtgRaw(card.card)?.name || name, lang, lang !== 'en')
    // Step within the group on show: the deck's language, or — from an "[EN]"
    // pin — the English printings, so the marker is kept.
    const pin = pinOf(name)
    const own = displayable(all, lang)
    const prints = pin.lang === 'en' && own.length && own[0]!.lang !== 'en' ? all.filter(p => p.lang === 'en') : own
    if (prints.length < 2)
      return
    // The entry's pin first: the resolved card lags behind a step just taken.
    // A pin this group cannot show is not what is on screen: step from the
    // displayed printing instead.
    const indexOf = (key: string) => key ? prints.findIndex(p => printKey(p.set, p.collectorNumber, p.lang) === key) : -1
    const c = mtgRaw(card.card)
    const pinned = indexOf(pinPrintKey(pin, lang))
    const i = pinned >= 0 ? pinned : indexOf(c ? printKey(c.set, c.collector_number, c.lang) : '')
    const next = prints[i < 0 ? (dir > 0 ? 0 : prints.length - 1) : (i + dir + prints.length) % prints.length]!
    write([{ name, ...pinFor(next, lang, all) }])
    const key = printKey(next.set, next.collectorNumber, next.lang)
    const images = new Map(pendingImages.value)
    images.set(norm(name), { key, image: next.image ?? '' })
    pendingImages.value = images
    // Never stuck: if the deck resolves to another printing (or not at all),
    // the real card takes over after a while anyway.
    setTimeout(() => {
      if (pendingImages.value.get(norm(name))?.key !== key)
        return
      const rest = new Map(pendingImages.value)
      rest.delete(norm(name))
      pendingImages.value = rest
    }, 4000)
  }

  // ---- Deck-wide actions ----
  const deckPrints = ref<Map<string, PrintOption[]> | null>(null)
  const deckSets = ref<SetCoverage[]>([])
  const deckPrintsLoading = ref(false)
  let deckPrintsLang = ''
  // Monotonic, like loadCards: a load outrun by a deck edit drops its answer.
  let deckPrintsToken = 0

  // Printings of every card of the deck, fetched when the artwork panel shows.
  async function loadDeckPrints() {
    const lang = ctx.lang()
    if (deckPrintsLoading.value || (deckPrints.value && deckPrintsLang === lang))
      return
    deckPrintsLoading.value = true
    const token = ++deckPrintsToken
    try {
      // Entry name → the card's own name (a double-faced card's printings are
      // found by its full name; an entry may be typed in French).
      const byEntry = new Map(ctx.resolvedCards.value
        .filter(rc => rc.card)
        .map(rc => [norm(rc.entry.name), mtgRaw(rc.card)!.name]))
      const names = ctx.entries().map(e => byEntry.get(norm(e.name)) ?? e.name)
      // English printings included: the "all in English" action picks among them.
      const found = await printsOfMany(names, lang, true)
      if (token !== deckPrintsToken)
        return
      const perEntry = new Map<string, PrintOption[]>()
      ctx.entries().forEach((e, i) => perEntry.set(e.name, found.get(names[i]!.trim()) ?? []))
      deckPrints.value = perEntry
      deckPrintsLang = lang
      // Sets are offered for what shows without "[EN]": the deck's language.
      deckSets.value = setCoverage(new Map([...perEntry].map(([n, p]) => [n, displayable(p, lang)])))
    }
    catch {
      if (token === deckPrintsToken)
        deckPrints.value = null
    }
    finally {
      if (token === deckPrintsToken)
        deckPrintsLoading.value = false
    }
  }
  // A card added or removed changes what the actions cover.
  watch(() => ctx.entries().map(e => norm(e.name)).join('|'), () => {
    deckPrintsToken++
    deckPrintsLoading.value = false
    deckPrints.value = null
    deckSets.value = []
  })

  async function applyBulk(mode: BulkArtMode) {
    const entries = ctx.entries()
    if (mode.kind !== 'auto') {
      await loadDeckPrints()
      if (!deckPrints.value)
        return
    }
    const lang = ctx.lang()
    const pins: Pin[] = []
    for (const e of entries) {
      const all = deckPrints.value?.get(e.name) ?? []
      // "All in English" chooses among every English printing; the other
      // actions among what the deck's language shows on its own.
      const pick = pickPrint(mode.kind === 'english' ? all : displayable(all, lang), mode)
      if (pick !== undefined)
        pins.push({ name: e.name, ...(pick ? pinFor(pick, lang, all) : {}) })
    }
    const before = entries.map(e => pinOf(e.name))
    const changed = write(pins)
    if (!changed) {
      toast.add({ title: ctx.t('print.bulk.none'), icon: 'i-lucide-layers', color: 'neutral' })
      return
    }
    toast.add({
      title: ctx.t('toast.printsBulk'),
      description: `${changed} ${ctx.t('print.bulk.cards')}`,
      icon: 'i-lucide-layers',
      color: 'success',
      actions: [{ label: ctx.t('build.undo'), onClick: () => { write(before) } }],
    })
  }

  return {
    setPrinting,
    cyclePrint,
    pendingImages,
    deckSets,
    deckPrintsLoading,
    loadDeckPrints,
    applyBulk,
  }
}
