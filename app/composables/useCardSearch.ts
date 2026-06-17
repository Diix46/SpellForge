import type { ManaColor } from './useMtg'
import type { ScryfallCard } from './useScryfall'
import { ref } from 'vue'

export interface SearchTheme {
  key: string
  /** i18n key for the label. */
  labelKey: string
  icon: string
  /** Scryfall fragment this theme contributes. */
  query: string
}

// Predefined themes → battle-tested Scryfall fragments. The player picks an
// intention ("removal", "ramp") instead of needing to know card names.
export const SEARCH_THEMES: SearchTheme[] = [
  { key: 'draw', labelKey: 'theme.draw', icon: 'i-lucide-book-open', query: 'oracle:"draw a card"' },
  { key: 'removal', labelKey: 'theme.removal', icon: 'i-lucide-crosshair', query: '(oracle:destroy or oracle:exile) (oracle:creature or oracle:permanent)' },
  { key: 'ramp', labelKey: 'theme.ramp', icon: 'i-lucide-trending-up', query: '(oracle:"search your library for a" oracle:land) or oracle:"add {" type:artifact' },
  { key: 'tokens', labelKey: 'theme.tokens', icon: 'i-lucide-copy', query: 'oracle:"create" oracle:token' },
  { key: 'lifegain', labelKey: 'theme.lifegain', icon: 'i-lucide-heart-pulse', query: 'oracle:"gain" oracle:life' },
  { key: 'counter', labelKey: 'theme.counter', icon: 'i-lucide-shield-x', query: 'oracle:"counter target"' },
  { key: 'boardwipe', labelKey: 'theme.boardwipe', icon: 'i-lucide-bomb', query: 'oracle:"destroy all" or oracle:"each creature"' },
  { key: 'tutor', labelKey: 'theme.tutor', icon: 'i-lucide-search', query: 'oracle:"search your library for a"' },
  { key: 'graveyard', labelKey: 'theme.graveyard', icon: 'i-lucide-skull', query: 'oracle:"from your graveyard"' },
  { key: 'flying', labelKey: 'theme.flying', icon: 'i-lucide-feather', query: 'keyword:flying' },
]

export type CardTypeFilter = '' | 'creature' | 'instant' | 'sorcery' | 'artifact' | 'enchantment' | 'planeswalker' | 'land'

export type SortOrder = 'edhrec' | 'eur' | 'name' | 'cmc'

export interface SearchFilters {
  text: string // free text → name or oracle
  themes: string[] // theme keys
  type: CardTypeFilter
  subtype: string // e.g. "elf", "dragon"
  colors: ManaColor[] // explicit color filter (within identity)
  maxCmc: number | null
  maxPrice: number | null // budget filter: max EUR per card
  order: SortOrder // result sort order
  commanderOnly: boolean // is:commander (for picking a commander)
}

export function emptyFilters(): SearchFilters {
  return { text: '', themes: [], type: '', subtype: '', colors: [], maxCmc: null, maxPrice: null, order: 'edhrec', commanderOnly: false }
}

export interface QueryContext {
  /** Commander color identity to constrain results (EDH legality). null = no constraint. */
  identity: ManaColor[] | null
  /** Site locale → return that printing (FR images in FR, EN in EN). */
  lang: 'fr' | 'en'
}

/**
 * Build a Scryfall query string from structured filters, constrained to a
 * commander's color identity (so illegal cards never appear) and the locale.
 */
export function buildScryfallQuery(filters: SearchFilters, ctx: QueryContext): string {
  const parts: string[] = []

  const text = filters.text.trim()
  if (text) {
    // If it looks like raw Scryfall syntax (contains a `:`/`<`/`>` operator), pass through.
    if (/\w+[:<>=]/.test(text)) {
      parts.push(text)
    }
    else {
      // Bare term: Scryfall matches the card name in the current language
      // (so the French printed name works too with lang:fr), OR the oracle text.
      const safe = text.replace(/["()]/g, '')
      parts.push(`("${safe}" or oracle:"${safe}")`)
    }
  }

  for (const key of filters.themes) {
    const theme = SEARCH_THEMES.find(t => t.key === key)
    if (theme)
      parts.push(`(${theme.query})`)
  }

  if (filters.type)
    parts.push(`type:${filters.type}`)
  if (filters.subtype.trim())
    parts.push(`type:${filters.subtype.trim().toLowerCase()}`)
  // Explicit color filter (WUBRG pips): cards that ARE those colors.
  if (filters.colors.length)
    parts.push(`color>=${filters.colors.join('')}`)
  if (filters.maxCmc != null)
    parts.push(`cmc<=${filters.maxCmc}`)
  // Budget filter: only cards at or below the max EUR price.
  if (filters.maxPrice != null)
    parts.push(`eur<=${filters.maxPrice}`)
  if (filters.commanderOnly)
    parts.push('is:commander')

  // Constrain to the commander's color identity (EDH legality).
  if (ctx.identity) {
    parts.push(ctx.identity.length ? `id<=${ctx.identity.join('')}` : 'id:colorless')
  }

  // Return the printing matching the site locale (FR images when in French).
  parts.push(`lang:${ctx.lang}`)

  // Exclude funny/un-sets by default for a cleaner pool.
  parts.push('-is:funny legal:commander')

  return parts.join(' ').trim()
}

export interface SearchState {
  loading: boolean
  error: string | null
  total: number
  hasMore: boolean
  page: number
  cards: ScryfallCard[]
}

export function useCardSearch() {
  const state = ref<SearchState>({
    loading: false,
    error: null,
    total: 0,
    hasMore: false,
    page: 1,
    cards: [],
  })

  let lastQuery = ''
  let lastOrder: SortOrder = 'edhrec'

  async function run(query: string, page = 1, append = false, order: SortOrder = 'edhrec') {
    if (!query) {
      state.value = { loading: false, error: null, total: 0, hasMore: false, page: 1, cards: [] }
      return
    }
    lastQuery = query
    lastOrder = order
    state.value.loading = true
    state.value.error = null
    try {
      const res = await $fetch<{ total: number, hasMore: boolean, cards: ScryfallCard[] }>('/api/cards/search', {
        params: { q: query, page, order, dir: 'auto' },
      })
      // Ignore out-of-order responses (a newer search superseded this one).
      if (query !== lastQuery)
        return
      state.value.total = res.total
      state.value.hasMore = res.hasMore
      state.value.page = page
      state.value.cards = append ? [...state.value.cards, ...res.cards] : res.cards
    }
    catch (err: unknown) {
      state.value.error = err instanceof Error ? err.message : 'erreur'
      if (!append)
        state.value.cards = []
    }
    finally {
      state.value.loading = false
    }
  }

  async function search(filters: SearchFilters, ctx: QueryContext) {
    await run(buildScryfallQuery(filters, ctx), 1, false, filters.order)
  }

  async function loadMore() {
    if (state.value.loading || !state.value.hasMore || !lastQuery)
      return
    // Paginate the SAME query + order that produced the current results —
    // rebuilding from filters could fetch page N of a query whose page 1 was
    // never shown (e.g. filters changed but the debounced search hasn't re-run).
    await run(lastQuery, state.value.page + 1, true, lastOrder)
  }

  async function autocomplete(text: string): Promise<string[]> {
    if (text.trim().length < 2)
      return []
    try {
      const res = await $fetch<{ names: string[] }>('/api/cards/autocomplete', { params: { q: text.trim() } })
      return res.names
    }
    catch {
      return []
    }
  }

  /**
   * Load EDHREC "often played with" suggestions for a commander, resolved to
   * Scryfall cards in the requested language, and display them as results.
   */
  async function suggest(commander: string, lang: 'fr' | 'en') {
    if (!commander)
      return
    const tag = `suggest:${commander}`
    lastQuery = tag
    state.value.loading = true
    state.value.error = null
    try {
      const { names } = await $fetch<{ names: string[] }>('/api/cards/suggestions', { params: { commander } })
      if (lastQuery !== tag)
        return
      if (!names.length) {
        state.value = { loading: false, error: null, total: 0, hasMore: false, page: 1, cards: [] }
        return
      }
      // Resolve the names to cards (current language) via one Scryfall query.
      // Cap to Scryfall's friendly limit; keep EDHREC's relevance order client-side.
      const top = names.slice(0, 40)
      const q = `(${top.map(n => `!"${n.replace(/"/g, '')}"`).join(' or ')}) lang:${lang}`
      const res = await $fetch<{ cards: ScryfallCard[] }>('/api/cards/search', {
        params: { q, order: 'edhrec', dir: 'auto' },
      })
      if (lastQuery !== tag)
        return
      // Re-order results to match EDHREC ranking.
      const rank = new Map(top.map((n, i) => [n.toLowerCase(), i]))
      const cards = [...res.cards].sort(
        (a, b) => (rank.get(a.name.toLowerCase()) ?? 999) - (rank.get(b.name.toLowerCase()) ?? 999),
      )
      state.value.cards = cards
      state.value.total = cards.length
      state.value.hasMore = false
      state.value.page = 1
    }
    catch (err: unknown) {
      state.value.error = err instanceof Error ? err.message : 'erreur'
      state.value.cards = []
    }
    finally {
      state.value.loading = false
    }
  }

  return { state, search, loadMore, autocomplete, suggest }
}
