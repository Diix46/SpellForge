import type { Ref } from 'vue'
import type { GameId } from '#shared/game'
import type { LandingSearch } from '#shared/landing'
import type { OptcgCard } from '#shared/optcg/types'
import type { TcgCard } from '#shared/tcg/types'
import { computed, ref, watch } from 'vue'
import { deckPath, GAME_LIST, GAMES, libraryPath, UNIVERSE_SLUG } from '#shared/game'
import { isTcgGame } from '#shared/tcg/types'
import { useDeckStore } from '~/composables/useDeckStore'
import { useLocale } from '~/composables/useLocale'

// The ⌘K palette's data layer: static actions, deck-navigation items, live card
// autocomplete from the local card database, plus the filter + group logic.
// It follows the universe: inside One Piece it suggests One Piece cards and
// lists One Piece decks first, a card opening in its library; elsewhere it
// searches the five games at once, a group per game, a card opening on its
// own page. Extracted from CommandPalette so the component only owns
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

interface CardHit { key: string, label: string, hint: string, query: string, game: GameId, path?: string }

export function useCommandPaletteSearch(q: Ref<string>, handlers: Handlers) {
  const { t, locale } = useLocale()
  const { decks } = useDeckStore()
  const { universe } = useUniverse()
  const { go } = handlers
  // "My decks" is for members: a guest starts a deck from a library.
  const { loggedIn } = useUserSession()
  const cardGame = computed(() => universe.value ?? 'mtg')

  // ----- Static actions -----
  const actions = computed<CommandItem[]>(() => [
    // Inside a universe, a new deck or an import starts in that game.
    { id: 'new', label: t('cmd.newDeck'), icon: 'i-lucide-plus', group: t('cmd.grpActions'), run: () => go(loggedIn.value ? `/decks?new=${universe.value ?? '1'}` : libraryPath(cardGame.value)) },
    { id: 'import', label: t('cmd.import'), icon: 'i-lucide-download', group: t('cmd.grpActions'), run: () => go(loggedIn.value ? `/decks?import=${universe.value ?? '1'}` : libraryPath(cardGame.value)) },
    { id: 'home', label: t('cmd.allDecks'), icon: 'i-lucide-layout-grid', group: t('cmd.grpActions'), run: () => go('/decks') },
    { id: 'landing', label: t('cmd.home'), icon: 'i-lucide-house', group: t('cmd.grpActions'), run: () => go('/') },
    ...GAME_LIST.map(g => ({ id: `lib-${g.id}`, label: t('cmd.library').replace('{game}', g.label), icon: g.icon, group: t('cmd.grpActions'), run: () => go(libraryPath(g.id)) })),
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
        hint: GAMES[d.game].label,
        icon: GAMES[d.game].icon,
        group: t('cmd.grpDecks'),
        run: () => go(deckPath(d)),
      })),
  )

  // ----- Live card autocomplete, in the universe's game -----
  const cardHits = ref<CardHit[]>([])
  let seq = 0
  async function fetchHits(term: string): Promise<CardHit[]> {
    const game = universe.value
    // Outside a game: every game at once, three cards each.
    if (!game) {
      const found = await $fetch<LandingSearch>('/api/landing/search', { params: { q: term, lang: locale.value } })
      return GAME_LIST.flatMap(g => (found[g.id] ?? []).slice(0, 3).map(h => ({ key: `${g.id}-${h.id}`, label: h.name, hint: h.meta, query: h.name, game: g.id, path: h.path })))
    }
    if (isTcgGame(game)) {
      const { cards } = await $fetch<{ cards: TcgCard[] }>(`/api/tcg/${game}/autocomplete`, { params: { q: term, lang: locale.value } })
      return cards.map(c => ({ key: c.id, label: c.name, hint: c.setName ?? c.set, query: c.name, game }))
    }
    if (game === 'optcg') {
      const { cards } = await $fetch<{ cards: OptcgCard[] }>('/api/optcg/autocomplete', { params: { q: term, lang: locale.value } })
      return cards.map(c => ({ key: c.id, label: c.name, hint: c.number, query: c.number, game }))
    }
    const { names } = await $fetch<{ names: string[] }>('/api/cards/autocomplete', { params: { q: term } })
    return names.map(name => ({ key: name, label: name, hint: t('cmd.card'), query: name, game }))
  }
  watch([q, universe], async ([val]) => {
    const term = val.trim()
    const mine = ++seq
    if (term.length < 2) {
      cardHits.value = []
      return
    }
    try {
      const hits = await fetchHits(term)
      if (mine === seq)
        cardHits.value = universe.value ? hits.slice(0, 6) : hits
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
      icon: GAMES[hit.game].icon,
      // Outside a game, a group per game.
      group: universe.value ? t('cmd.grpCards') : `${t('cmd.grpCards')} · ${GAMES[hit.game].label}`,
      run: () => go(hit.path ?? `/${UNIVERSE_SLUG[hit.game]}?q=${encodeURIComponent(hit.query)}`),
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
