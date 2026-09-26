import type { SetKind, SetProgress } from '#shared/collection'
import type { GameId } from '#shared/game'
import { computed, reactive, watch } from 'vue'
import { completion, SET_KINDS, setKind } from '#shared/collection'

export type SetSort = 'recent' | 'progress' | 'name'

export interface SetFilters {
  q: string
  /** 'all' for every family. */
  kind: SetKind | 'all'
  sort: SetSort
  /** Leave out the sets already complete. */
  hideComplete: boolean
  /** Show the sets not started yet too. */
  all: boolean
}

/**
 * The sets page's data: each set's progress from the server (the started
 * ones, or every set), refreshed as copies come and go, then filtered and
 * sorted here; and the overall progress over the started sets.
 */
export function useCollectionSets(game: GameId) {
  const { locale } = useLocale()
  const collection = useCollection(game)
  const filters = reactive<SetFilters>({ q: '', kind: 'all', sort: 'recent', hideComplete: false, all: false })

  const { data, status, error, refresh } = useFetch<{ sets: SetProgress[] }>('/api/collection/sets', {
    query: { game, all: computed(() => (filters.all ? '1' : '0')), lang: computed(() => (locale.value === 'fr' ? 'fr' : 'en')) },
    server: false,
    default: () => ({ sets: [] }),
  })

  // Each add, edit or removal moves the bars (once the edits settle).
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(collection.copies, () => {
    clearTimeout(timer)
    timer = setTimeout(() => void refresh(), 400)
  })

  const sets = computed(() => data.value?.sets ?? [])
  const started = computed(() => sets.value.filter(s => s.owned > 0))
  const overall = computed(() => completion(started.value))
  const completed = computed(() => started.value.filter(s => s.owned >= s.total).length)
  /** The families present, in their fixed order. */
  const kinds = computed(() => {
    const present = new Set(sets.value.map(s => setKind(game, s.type)))
    return SET_KINDS.filter(k => present.has(k))
  })

  const shown = computed(() => {
    const q = filters.q.trim().toLowerCase()
    const out = sets.value.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !s.code.toLowerCase().includes(q))
        return false
      if (filters.kind !== 'all' && setKind(game, s.type) !== filters.kind)
        return false
      return !(filters.hideComplete && s.owned >= s.total)
    })
    // The server lists them newest first.
    if (filters.sort === 'progress')
      out.sort((a, b) => b.owned / b.total - a.owned / a.total || b.owned - a.owned)
    else if (filters.sort === 'name')
      out.sort((a, b) => a.name.localeCompare(b.name, locale.value))
    return out
  })

  return { filters, status, error, refresh, sets, started, overall, completed, kinds, shown }
}
