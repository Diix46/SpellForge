import type { DeckEntry } from '~/composables/useDecklist'
import type { ResolvedCard } from '~/composables/useScryfall'
import { computed, ref } from 'vue'
import { errMessage } from '~/composables/useErrors'
import { useScryfall } from '~/composables/useScryfall'

// The card-resolution engine for the deck page. Owns the resolved cards, the
// in-flight/progress state, the dirty flag, and the monotonic-token loadCards()
// machinery. Extracted from deck/[id].vue with ZERO behaviour change.
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

  async function loadCards(opts: { silent?: boolean } = {}) {
    if (cardCount() === 0)
      return
    // Claim this resolve and snapshot the inputs. Don't bail when another resolve
    // is running — supersede it: the older one's token is now stale and its result
    // will be discarded below, so switching decks mid-resolve still loads the new one.
    const token = ++loadToken
    const entries = allEntries()
    const reqLang = lang()
    fetching.value = true
    fetchProgress.value = { loaded: 0, total: cardCount() }
    onLoadStart?.()
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
