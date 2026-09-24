import type { DeckEntry } from '~/composables/useDecklist'
import type { ResolvedCard } from '~/composables/useScryfall'
import { computed, ref } from 'vue'
import { errMessage } from '~/composables/useErrors'
import { useScryfall } from '~/composables/useScryfall'

// The card-resolution engine for the deck page. Owns the resolved cards, the
// in-flight/progress state, the dirty flag, and the monotonic-token loadCards()
// machinery. Resolution is incremental: only cards not seen yet are fetched.
//
// Reactive deps are injected as plain getters (read lazily inside loadCards), so
// the composable can be created BEFORE the page's allEntries/cardCount computeds
// are declared without tripping a temporal-dead-zone error. It internally wires
// useScryfall().fetchCollection + useToast() — exactly as the page did.

interface ResolvedCardsCtx {
  /** All parsed deck entries (mainboard + sideboard) — read at resolve time. */
  allEntries: () => DeckEntry[]
  /** Total card count — the loadCards no-op guard + progress total. */
  cardCount: () => number
  /** Site/card language (follows the locale). */
  lang: () => 'en' | 'fr'
  /** i18n translator (so the toasts read identically to the page's). */
  t: (key: string) => string
  /**
   * Called at the start of each loadCards() run (after the no-op guard), so the
   * page can reset pagination — preserves the original `page.value = 1` side
   * effect that lived inline in loadCards.
   */
  onLoadStart?: () => void
}

export function useResolvedCards(ctx: ResolvedCardsCtx) {
  const { allEntries, cardCount, lang, t, onLoadStart } = ctx
  const { fetchCollection } = useScryfall()
  const toast = useToast()

  const resolvedCards = ref<ResolvedCard[]>([])
  const fetching = ref(false)
  // Monotonic token: each loadCards() call claims the next value. A slower,
  // superseded resolve (e.g. deck A still in-flight when we switch to B) checks
  // its token before committing, so it can't clobber the current deck's cards.
  let loadToken = 0
  const fetchProgress = ref({ loaded: 0, total: 0 })

  // True when the decklist changed since the last image resolve (preview stale).
  // The page's rawDecklist watcher sets this true; loadCards sets it false.
  const resolvedDirty = ref(false)

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

  // Resolved cards by entry (name, pinned printing, language), so an edit only
  // asks the server for the cards it has not seen. A card the server could not
  // be reached for is never kept: the next load asks again.
  const cache = new Map<string, ResolvedCard>()
  const CACHE_MAX = 3000
  const keyOf = (e: DeckEntry, l: string) => `${l}|${e.name.trim().toLowerCase()}|${e.set ?? ''}|${e.collectorNumber ?? ''}|${e.lang ?? ''}|${e.hd ? 'hd' : ''}`
  function remember(key: string, rc: ResolvedCard) {
    if (rc.transient)
      return
    if (cache.size >= CACHE_MAX)
      cache.delete(cache.keys().next().value!)
    cache.set(key, rc)
  }

  async function loadCards(opts: { silent?: boolean } = {}) {
    // Claim this resolve. A slower older one (deck A still loading when B
    // opens) finds its token stale and drops its result.
    const token = ++loadToken
    const entries = allEntries()
    const reqLang = lang()
    // An empty deck shows nothing, even if a load for its previous content is
    // still on its way.
    if (cardCount() === 0 || !entries.length) {
      resolvedCards.value = []
      resolvedDirty.value = false
      fetching.value = false
      return
    }
    const firstLoad = resolvedCards.value.length === 0
    const assemble = (fresh = new Map<string, ResolvedCard>()) => entries.map((entry) => {
      const hit = cache.get(keyOf(entry, reqLang)) ?? fresh.get(keyOf(entry, reqLang))
      return hit ? { ...hit, entry } : null
    })

    const unknown = [...new Map(entries
      .filter(e => !cache.has(keyOf(e, reqLang)))
      .map(e => [keyOf(e, reqLang), e])).values()]

    if (!unknown.length) {
      resolvedCards.value = assemble() as ResolvedCard[]
      resolvedDirty.value = false
      fetching.value = false
      return
    }

    fetching.value = true
    fetchProgress.value = { loaded: 0, total: unknown.length }
    if (firstLoad)
      onLoadStart?.()
    try {
      const fresh = new Map<string, ResolvedCard>()
      const result = await fetchCollection(
        unknown,
        reqLang,
        (p) => {
          if (token === loadToken)
            fetchProgress.value = p
        },
        // First paint as soon as a batch lands: what is known, plus the new cards
        // resolved so far.
        (partial) => {
          if (token !== loadToken)
            return
          partial.forEach((rc, i) => fresh.set(keyOf(unknown[i]!, reqLang), rc))
          resolvedCards.value = assemble(fresh).filter((rc): rc is ResolvedCard => rc !== null)
        },
      )
      result.forEach((rc, i) => {
        const key = keyOf(unknown[i]!, reqLang)
        fresh.set(key, rc)
        remember(key, rc)
      })
      if (token !== loadToken)
        return // superseded by a newer load (deck switched): drop these cards
      resolvedCards.value = assemble(fresh) as ResolvedCard[]
      const failed = result.some(rc => rc.transient)
      // Unreachable server: keep the list stale so the next open retries.
      resolvedDirty.value = failed
      if (failed) {
        toast.add({
          title: t('toast.loadError'),
          description: t('toast.loadRetry'),
          color: 'error',
          icon: 'i-lucide-wifi-off',
          actions: [{ label: t('toast.retry'), onClick: () => { void loadCards({ silent: true }) } }],
        })
        return
      }
      if (opts.silent)
        return
      const ok = resolvedCards.value.filter(c => c.imageUrl).length
      const missing = resolvedCards.value.filter(c => !c.imageUrl).length
      toast.add({
        title: t('toast.cardsLoaded'),
        description: missing
          ? `${ok} OK, ${missing} ${t('toast.notFoundCount')}`
          : `${ok} ${t('toast.cardsReady')}`,
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

  return {
    resolvedCards,
    fetching,
    fetchProgress,
    resolvedDirty,
    loadCards,
    resolvedByName,
    resolvedFor,
  }
}
