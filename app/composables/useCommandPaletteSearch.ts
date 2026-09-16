import type { Ref } from 'vue'
import type { OptcgCard } from '#shared/optcg/types'
import { computed, ref, watch } from 'vue'
import { deckPath, libraryPath, UNIVERSE_SLUG } from '#shared/game'
import { useDeckStore } from '~/composables/useDeckStore'
import { useLocale } from '~/composables/useLocale'

// The ⌘K palette's data layer: static actions, deck-navigation items, live card
// autocomplete from the local card database, plus the filter + group logic.
// It follows the universe: inside One Piece it suggests One Piece cards and
// lists One Piece decks first; elsewhere it suggests Magic cards. A card opens
// in its library. Extracted from CommandPalette so the component only owns
// focus, keyboard nav, and rendering.

export interface CommandItem {
  id: string
  label: string
  hint?: string
  icon: string
  kbd?: string
  group: string
  pips?: string[]
  run: () => void
}

interface Handlers {
  /** Navigate to an app route (closes the palette). */
  go: (path: string) => void
}

interface CardHit { key: string, label: string, hint: string, query: string }

export function useCommandPaletteSearch(q: Ref<string>, handlers: Handlers) {
  const { t, locale } = useLocale()
  const { decks } = useDeckStore()
  const { universe } = useUniverse()
  const { go } = handlers
  const cardGame = computed(() => universe.value ?? 'mtg')

  // ----- Static actions -----
  const actions = computed<CommandItem[]>(() => [
    { id: 'new', label: t('cmd.newDeck'), icon: 'i-lucide-plus', kbd: 'N', group: t('cmd.grpActions'), run: () => go('/?new=1') },
    { id: 'import', label: t('cmd.import'), icon: 'i-lucide-download', group: t('cmd.grpActions'), run: () => go('/?import=1') },
    { id: 'home', label: t('cmd.allDecks'), icon: 'i-lucide-layout-grid', group: t('cmd.grpActions'), run: () => go('/') },
    { id: 'lib-optcg', label: t('cmd.libraryOp'), icon: 'i-lucide-anchor', group: t('cmd.grpActions'), run: () => go(libraryPath('optcg')) },
    { id: 'lib-mtg', label: t('cmd.libraryMtg'), icon: 'i-lucide-book-open', group: t('cmd.grpActions'), run: () => go(libraryPath('mtg')) },
    { id: 'discover', label: t('nav.discover'), icon: 'i-lucide-compass', group: t('cmd.grpActions'), run: () => go('/discover') },
  ])

  // ----- Deck navigation (from the store) -----
  // The current universe's decks come first; the sort is stable otherwise.
  const deckItems = computed<CommandItem[]>(() =>
    [...decks.value]
      .sort((a, b) => Number(b.game === universe.value) - Number(a.game === universe.value))
      .map(d => ({
        id: `deck-${d.id}`,
        label: d.name,
        hint: d.game === 'optcg' ? 'One Piece' : 'Magic',
        icon: d.game === 'optcg' ? 'i-lucide-anchor' : 'i-lucide-book-open',
        group: t('cmd.grpDecks'),
        run: () => go(deckPath(d)),
      })),
  )

  // ----- Live card autocomplete, in the universe's game -----
  const cardHits = ref<CardHit[]>([])
  let seq = 0
  async function fetchHits(term: string): Promise<CardHit[]> {
    if (cardGame.value === 'optcg') {
      const { cards } = await $fetch<{ cards: OptcgCard[] }>('/api/optcg/autocomplete', { params: { q: term, lang: locale.value } })
      return cards.map(c => ({ key: c.id, label: c.name, hint: c.number, query: c.number }))
    }
    const { names } = await $fetch<{ names: string[] }>('/api/cards/autocomplete', { params: { q: term } })
    return names.map(name => ({ key: name, label: name, hint: t('cmd.card'), query: name }))
  }
  watch([q, cardGame], async ([val]) => {
    const term = val.trim()
    const mine = ++seq
    if (term.length < 2) {
      cardHits.value = []
      return
    }
    try {
      const hits = await fetchHits(term)
      if (mine === seq)
        cardHits.value = hits.slice(0, 6)
    }
    catch {
      if (mine === seq)
        cardHits.value = []
    }
  })
  const cardItems = computed<CommandItem[]>(() =>
    cardHits.value.map(hit => ({
      id: `card-${hit.key}`,
      label: hit.label,
      hint: hit.hint,
      icon: cardGame.value === 'optcg' ? 'i-lucide-scroll' : 'i-lucide-sparkles',
      group: t('cmd.grpCards'),
      run: () => go(`/${UNIVERSE_SLUG[cardGame.value]}?q=${encodeURIComponent(hit.query)}`),
    })),
  )

  // ----- Filter + flatten -----
  function match(it: CommandItem, term: string) {
    return it.label.toLowerCase().includes(term) || it.group.toLowerCase().includes(term)
  }
  const results = computed<CommandItem[]>(() => {
    const term = q.value.trim().toLowerCase()
    const acts = term ? actions.value.filter(a => match(a, term)) : actions.value
    const dks = term ? deckItems.value.filter(d => match(d, term)) : deckItems.value.slice(0, 5)
    // cards only show when actively typing (they come from the API)
    return [...acts, ...dks, ...cardItems.value]
  })

  // group results for rendering, preserving order
  const grouped = computed(() => {
    const out: { group: string, items: CommandItem[] }[] = []
    for (const it of results.value) {
      let g = out.find(x => x.group === it.group)
      if (!g) {
        g = { group: it.group, items: [] }
        out.push(g)
      }
      g.items.push(it)
    }
    return out
  })

  /** Clear the live card list (called when the palette opens). */
  function reset() {
    cardHits.value = []
  }

  return { results, grouped, reset }
}
