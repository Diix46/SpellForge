import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import { useDeckStore } from '~/composables/useDeckStore'
import { useLocale } from '~/composables/useLocale'

// The ⌘K palette's data layer: static actions, deck-navigation items, live card
// autocomplete (Scryfall via our cached route), plus the filter + group logic.
// Extracted from CommandPalette so the component only owns focus, keyboard nav,
// and rendering. Takes the query ref + a `run` factory so navigation/side-effects
// stay in the component.

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
  /** Open a card on Scryfall (closes the palette). */
  openScryfall: (name: string) => void
}

export function useCommandPaletteSearch(q: Ref<string>, handlers: Handlers) {
  const { t } = useLocale()
  const { decks } = useDeckStore()
  const { go, openScryfall } = handlers

  // ----- Static actions -----
  const actions = computed<CommandItem[]>(() => [
    { id: 'new', label: t('cmd.newDeck'), icon: 'i-lucide-plus', kbd: 'N', group: t('cmd.grpActions'), run: () => go('/?new=1') },
    { id: 'import', label: t('cmd.import'), icon: 'i-lucide-download', group: t('cmd.grpActions'), run: () => go('/?import=1') },
    { id: 'home', label: t('cmd.allDecks'), icon: 'i-lucide-layout-grid', group: t('cmd.grpActions'), run: () => go('/') },
  ])

  // ----- Deck navigation (from the store) -----
  const deckItems = computed<CommandItem[]>(() =>
    decks.value.map(d => ({
      id: `deck-${d.id}`,
      label: d.name,
      hint: t('cmd.deck'),
      icon: 'i-lucide-layers',
      group: t('cmd.grpDecks'),
      run: () => go(`/deck/${d.id}`),
    })),
  )

  // ----- Live card autocomplete (Scryfall via our cached route) -----
  const cardNames = ref<string[]>([])
  let seq = 0
  watch(q, async (val) => {
    const term = val.trim()
    if (term.length < 2) {
      cardNames.value = []
      return
    }
    const mine = ++seq
    try {
      const { names } = await $fetch<{ names: string[] }>('/api/cards/autocomplete', { params: { q: term } })
      if (mine === seq)
        cardNames.value = names.slice(0, 6)
    }
    catch {
      if (mine === seq)
        cardNames.value = []
    }
  })
  const cardItems = computed<CommandItem[]>(() =>
    cardNames.value.map(name => ({
      id: `card-${name}`,
      label: name,
      hint: t('cmd.card'),
      icon: 'i-lucide-sparkles',
      group: t('cmd.grpCards'),
      run: () => openScryfall(name),
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
    cardNames.value = []
  }

  return { results, grouped, reset }
}
