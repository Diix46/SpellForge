import type { OptcgCategory, OptcgColor } from '#shared/optcg/rules'
import type { OptcgCard, OptcgSortOrder } from '#shared/optcg/types'
import { shallowRef } from 'vue'

export interface OptcgFilters {
  text: string
  category: OptcgCategory | ''
  colors: OptcgColor[]
  costMin: number | null
  costMax: number | null
  set: string
  legalOnly: boolean
  counterOnly: boolean
  order: OptcgSortOrder
}

export function emptyOptcgFilters(): OptcgFilters {
  return { text: '', category: '', colors: [], costMin: null, costMax: null, set: '', legalOnly: false, counterOnly: false, order: 'number' }
}

export interface OptcgSearchContext {
  lang: 'fr' | 'en'
  /** The deck's Leader colours; null while no Leader is chosen (or outside a deck). */
  leaderColors: OptcgColor[] | null
}

/** Query parameters for /api/optcg/browse; only what actually filters. */
export function optcgBrowseParams(f: OptcgFilters, ctx: OptcgSearchContext, page: number): Record<string, string> {
  const p: Record<string, string> = { lang: ctx.lang, order: f.order, page: String(page) }
  if (f.text.trim())
    p.text = f.text.trim()
  if (f.category)
    p.category = f.category
  if (f.colors.length)
    p.colors = f.colors.join(',')
  if (ctx.leaderColors)
    p.leader = ctx.leaderColors.join(',')
  if (f.costMin != null)
    p.costMin = String(f.costMin)
  if (f.costMax != null)
    p.costMax = String(f.costMax)
  if (f.set)
    p.set = f.set
  if (f.legalOnly)
    p.legal = '1'
  if (f.counterOnly)
    p.counter = '1'
  return p
}

export interface OptcgBrowseResponse { total: number, hasMore: boolean, cards: OptcgCard[] }

export interface OptcgSearchState {
  loading: boolean
  failed: boolean
  total: number
  hasMore: boolean
  page: number
  cards: OptcgCard[]
}

const EMPTY: OptcgSearchState = { loading: false, failed: false, total: 0, hasMore: false, page: 1, cards: [] }

/**
 * One Piece card search. Same guarantees as the Magic search: only the most
 * recently started request may write the state, and a superseded one is
 * aborted rather than merely ignored.
 */
export function useOptcgSearch() {
  const state = shallowRef<OptcgSearchState>({ ...EMPTY })
  let last: { filters: OptcgFilters, ctx: OptcgSearchContext } | null = null
  let seq = 0
  let controller: AbortController | null = null

  async function run(filters: OptcgFilters, ctx: OptcgSearchContext, page: number, append: boolean) {
    const id = ++seq
    controller?.abort()
    const ac = new AbortController()
    controller = ac
    last = { filters: { ...filters, colors: [...filters.colors] }, ctx: { ...ctx } }
    state.value = { ...state.value, loading: true, failed: false }
    try {
      const res = await $fetch<OptcgBrowseResponse>('/api/optcg/browse', {
        params: optcgBrowseParams(filters, ctx, page),
        signal: ac.signal,
      })
      if (id !== seq)
        return
      state.value = {
        loading: false,
        failed: false,
        total: res.total,
        hasMore: res.hasMore,
        page,
        cards: append ? [...state.value.cards, ...res.cards] : res.cards,
      }
    }
    catch (err) {
      if (id !== seq || (err instanceof DOMException && err.name === 'AbortError'))
        return
      console.error('[optcg search]', err)
      state.value = { ...(append ? state.value : EMPTY), loading: false, failed: true }
    }
  }

  function search(filters: OptcgFilters, ctx: OptcgSearchContext) {
    return run(filters, ctx, 1, false)
  }

  /**
   * Take a first page fetched with the page (useAsyncData) as the current
   * results, so the server renders them and the browser starts from the same
   * state. Null: that fetch failed.
   */
  function prime(res: OptcgBrowseResponse | null, filters: OptcgFilters, ctx: OptcgSearchContext) {
    seq++
    last = { filters: { ...filters, colors: [...filters.colors] }, ctx: { ...ctx } }
    state.value = res
      ? { loading: false, failed: false, total: res.total, hasMore: res.hasMore, page: 1, cards: res.cards }
      : { ...EMPTY, failed: true }
  }

  function loadMore() {
    const s = state.value
    if (!last || s.loading || !s.hasMore)
      return
    return run(last.filters, last.ctx, s.page + 1, true)
  }

  async function autocomplete(text: string, lang: 'fr' | 'en'): Promise<OptcgCard[]> {
    if (text.trim().length < 2)
      return []
    try {
      return (await $fetch<{ cards: OptcgCard[] }>('/api/optcg/autocomplete', { params: { q: text.trim(), lang } })).cards
    }
    catch {
      return []
    }
  }

  return { state, search, prime, loadMore, autocomplete }
}
