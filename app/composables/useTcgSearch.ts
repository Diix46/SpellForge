import type { TcgBrowseResponse, TcgCard, TcgGameId, TcgSortOrder } from '#shared/tcg/types'
import { shallowRef } from 'vue'
import { TCG_UI } from '~/utils/games/tcg'

export interface TcgFilters {
  text: string
  category: string
  subtype: string
  types: string[]
  rarity: string
  set: string
  /** Legal in this format only; empty: every card. */
  format: string
  order: TcgSortOrder
}

export function emptyTcgFilters(): TcgFilters {
  return { text: '', category: '', subtype: '', types: [], rarity: '', set: '', format: '', order: 'recent' }
}

/** Query parameters for /api/tcg/<game>/browse; only what actually filters. */
export function tcgBrowseParams(f: TcgFilters, lang: 'fr' | 'en', page: number, unique = false): Record<string, string> {
  const p: Record<string, string> = { lang, order: f.order, page: String(page) }
  if (unique)
    p.unique = '1'
  for (const key of ['category', 'subtype', 'rarity', 'set', 'format'] as const) {
    if (f[key])
      p[key] = f[key]
  }
  if (f.text.trim())
    p.text = f.text.trim()
  if (f.types.length)
    p.types = f.types.join(',')
  return p
}

export interface TcgSearchState {
  loading: boolean
  failed: boolean
  total: number
  hasMore: boolean
  page: number
  cards: TcgCard[]
}

const EMPTY: TcgSearchState = { loading: false, failed: false, total: 0, hasMore: false, page: 1, cards: [] }

/**
 * A generic-engine game's card search. As the other games' searches: only the
 * latest request writes the state, a superseded one is aborted.
 */
export function useTcgSearch(game: TcgGameId) {
  const state = shallowRef<TcgSearchState>({ ...EMPTY })
  let last: { filters: TcgFilters, lang: 'fr' | 'en' } | null = null
  let seq = 0
  let controller: AbortController | null = null

  async function run(filters: TcgFilters, lang: 'fr' | 'en', page: number, append: boolean) {
    const id = ++seq
    controller?.abort()
    const ac = new AbortController()
    controller = ac
    last = { filters: { ...filters, types: [...filters.types] }, lang }
    state.value = { ...state.value, loading: true, failed: false }
    try {
      const res = await $fetch<TcgBrowseResponse>(`/api/tcg/${game}/browse`, { params: tcgBrowseParams(filters, lang, page, TCG_UI[game].uniqueSearch), signal: ac.signal })
      if (id !== seq)
        return
      state.value = { loading: false, failed: false, total: res.total, hasMore: res.hasMore, page, cards: append ? [...state.value.cards, ...res.cards] : res.cards }
    }
    catch (err) {
      if (id !== seq || (err instanceof DOMException && err.name === 'AbortError'))
        return
      console.error(`[${game} search]`, err)
      state.value = { ...(append ? state.value : EMPTY), loading: false, failed: true }
    }
  }

  const search = (filters: TcgFilters, lang: 'fr' | 'en') => run(filters, lang, 1, false)

  /** A first page fetched with the page (useAsyncData) as the current results; null: it failed. */
  function prime(res: TcgBrowseResponse | null, filters: TcgFilters, lang: 'fr' | 'en') {
    seq++
    last = { filters: { ...filters, types: [...filters.types] }, lang }
    state.value = res ? { loading: false, failed: false, total: res.total, hasMore: res.hasMore, page: 1, cards: res.cards } : { ...EMPTY, failed: true }
  }

  function loadMore() {
    const s = state.value
    if (!last || s.loading || !s.hasMore)
      return
    return run(last.filters, last.lang, s.page + 1, true)
  }

  async function autocomplete(text: string, lang: 'fr' | 'en'): Promise<TcgCard[]> {
    if (text.trim().length < 2)
      return []
    try {
      return (await $fetch<{ cards: TcgCard[] }>(`/api/tcg/${game}/autocomplete`, { params: { q: text.trim(), lang } })).cards
    }
    catch {
      return []
    }
  }

  return { state, search, prime, loadMore, autocomplete }
}
