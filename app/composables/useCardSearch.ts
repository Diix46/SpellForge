import type { ResolvedRow } from './scryfall/toResolved'
import type { ManaColor } from './useMtg'
import type { ScryfallCard } from './useScryfall'
import { ref } from 'vue'

export interface SearchTheme {
  key: string
  /** i18n key for the label. */
  labelKey: string
  icon: string
  /** Scryfall fragment this theme contributes — used only by the raw-syntax path. */
  query: string
}

// Predefined themes. The player picks an intention ("removal", "ramp") instead
// of needing to know card names. The local search engine has its own
// definition of each key; the fragment here only serves raw-syntax searches.
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
 * True when the text is written in Scryfall syntax (`t:instant`, `cmc<=2`).
 * Those queries still go to Scryfall: the local engine has no parser for them
 * yet, and silently degrading a power user's query to plain text would return
 * wrong results with no hint why.
 */
export function isRawSyntax(text: string): boolean {
  return /\w+[:<>=]/.test(text.trim())
}

/**
 * Build a Scryfall query string from structured filters. Only the raw-syntax
 * path uses it now; everything else is served by the local search.
 */
export function buildScryfallQuery(filters: SearchFilters, ctx: QueryContext): string {
  const parts: string[] = []

  const text = filters.text.trim()
  if (text) {
    if (isRawSyntax(text)) {
      parts.push(text)
    }
    else {
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
  if (filters.colors.length)
    parts.push(`color>=${filters.colors.join('')}`)
  if (filters.maxCmc != null)
    parts.push(`cmc<=${filters.maxCmc}`)
  if (filters.maxPrice != null)
    parts.push(`eur<=${filters.maxPrice}`)
  if (filters.commanderOnly)
    parts.push('is:commander')
  if (ctx.identity)
    parts.push(ctx.identity.length ? `id<=${ctx.identity.join('')}` : 'id:colorless')
  parts.push(`lang:${ctx.lang}`)
  parts.push('-is:funny legal:commander')

  return parts.join(' ').trim()
}

/**
 * Query parameters for `/api/cards/browse`. Only set what is actually filtered,
 * so identical searches produce identical URLs.
 */
export function browseParams(filters: SearchFilters, ctx: QueryContext, page: number): Record<string, string> {
  const p: Record<string, string> = { lang: ctx.lang, order: filters.order, page: String(page) }
  const text = filters.text.trim()
  if (text)
    p.text = text
  if (filters.themes.length)
    p.themes = filters.themes.join(',')
  if (filters.type)
    p.type = filters.type
  if (filters.subtype.trim())
    p.subtype = filters.subtype.trim()
  if (filters.colors.length)
    p.colors = filters.colors.join('')
  if (filters.maxCmc != null)
    p.maxCmc = String(filters.maxCmc)
  if (filters.maxPrice != null)
    p.maxPrice = String(filters.maxPrice)
  if (filters.commanderOnly)
    p.commanderOnly = '1'
  // A colourless commander is sent as "C" (Magic's notation) rather than an
  // empty string: "no constraint" and "colourless" must never be confused, and
  // an empty parameter may be dropped in transit.
  if (ctx.identity)
    p.identity = ctx.identity.length ? ctx.identity.join('') : 'C'
  return p
}

export interface SearchState {
  loading: boolean
  error: string | null
  total: number
  hasMore: boolean
  page: number
  cards: ScryfallCard[]
}

// Single source of truth for an empty result set (init + every reset), so the
// SearchState shape lives in one place. Mirrors emptyFilters() above.
export function emptySearchState(): SearchState {
  return { loading: false, error: null, total: 0, hasMore: false, page: 1, cards: [] }
}

type SearchRequest
  = | { kind: 'browse', filters: SearchFilters, ctx: QueryContext }
    | { kind: 'syntax', query: string, order: SortOrder }

interface SearchResponse { total: number, hasMore: boolean, cards: ScryfallCard[] }

export function useCardSearch() {
  const state = ref<SearchState>(emptySearchState())
  const { t } = useLocale()

  // The request that produced the current results, so loadMore() paginates the
  // exact same search rather than whatever the filters say now.
  let lastRequest: SearchRequest | null = null
  // Monotonic request id: only the most recently STARTED request may write state.
  let seq = 0
  // Abort the previous in-flight request when a newer one starts, so a superseded
  // search stops downloading instead of just having its result ignored.
  let currentAc: AbortController | null = null

  function fetchPage(req: SearchRequest, page: number, signal: AbortSignal): Promise<SearchResponse> {
    if (req.kind === 'browse')
      return $fetch<SearchResponse>('/api/cards/browse', { params: browseParams(req.filters, req.ctx, page), signal })
    return $fetch<SearchResponse>('/api/cards/search', { params: { q: req.query, page, order: req.order, dir: 'auto' }, signal })
  }

  async function run(req: SearchRequest | null, page = 1, append = false) {
    if (!req) {
      seq++ // invalidate any in-flight request
      currentAc?.abort()
      currentAc = null
      lastRequest = null
      state.value = emptySearchState()
      return
    }
    const reqId = ++seq
    currentAc?.abort()
    const ac = new AbortController()
    currentAc = ac
    lastRequest = req
    state.value.loading = true
    state.value.error = null
    try {
      const res = await fetchPage(req, page, ac.signal)
      // Ignore out-of-order responses (a newer request superseded this one).
      if (reqId !== seq)
        return
      state.value.total = res.total
      state.value.hasMore = res.hasMore
      state.value.page = page
      state.value.cards = append ? [...state.value.cards, ...res.cards] : res.cards
    }
    catch (err: unknown) {
      // An aborted request (superseded by a newer search) is not an error.
      if (err instanceof DOMException && err.name === 'AbortError')
        return
      if (reqId !== seq)
        return
      state.value.error = err instanceof Error ? err.message : t('toast.loadError')
      if (!append)
        state.value.cards = []
    }
    finally {
      if (reqId === seq)
        state.value.loading = false
    }
  }

  async function search(filters: SearchFilters, ctx: QueryContext) {
    const req: SearchRequest = isRawSyntax(filters.text)
      ? { kind: 'syntax', query: buildScryfallQuery(filters, ctx), order: filters.order }
      : { kind: 'browse', filters: { ...filters, themes: [...filters.themes], colors: [...filters.colors] }, ctx: { ...ctx } }
    await run(req, 1, false)
  }

  async function loadMore() {
    if (state.value.loading || !state.value.hasMore || !lastRequest)
      return
    await run(lastRequest, state.value.page + 1, true)
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
   * Load EDHREC "often played with" suggestions for a commander and display
   * them as results.
   *
   * Names are resolved from the local database, which keeps EDHREC's order for
   * free — the resolver answers in input order. Suggestions with no French
   * printing now come back in English rather than being dropped, as the old
   * `lang:fr` query did.
   */
  async function suggest(commander: string, lang: 'fr' | 'en') {
    if (!commander)
      return
    // Share the monotonic seq gate with run(), so a search started afterwards
    // invalidates this suggestion (and vice-versa) — no cross-clobber.
    const reqId = ++seq
    lastRequest = null
    state.value.loading = true
    state.value.error = null
    try {
      const { names } = await $fetch<{ names: string[] }>('/api/cards/suggestions', { params: { commander } })
      if (reqId !== seq)
        return
      if (!names.length) {
        state.value = emptySearchState()
        return
      }
      const { cards: rows } = await $fetch<{ cards: ResolvedRow[] }>('/api/cards/resolve', {
        method: 'POST',
        body: { lang, entries: names.slice(0, 40).map(name => ({ name })) },
      })
      if (reqId !== seq)
        return
      const cards = rows.map(r => r.card).filter((c): c is ScryfallCard => !!c)
      state.value.cards = cards
      state.value.total = cards.length
      state.value.hasMore = false
      state.value.page = 1
    }
    catch (err: unknown) {
      if (reqId !== seq)
        return
      state.value.error = err instanceof Error ? err.message : t('toast.loadError')
      state.value.cards = []
    }
    finally {
      if (reqId === seq)
        state.value.loading = false
    }
  }

  return { state, search, loadMore, autocomplete, suggest }
}
