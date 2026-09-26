import type { GameId } from '#shared/game'
import { computed, ref, watch } from 'vue'

export type HistoryPeriod = '30' | '90' | '365' | 'all'

export interface HistoryPoint { day: string, value: number, paid: number, copies: number, cards: number }
export interface Mover {
  id: string
  name: string
  printedName: string | null
  set: string
  number: string
  finish: string
  thumb: string
  quantity: number
  then: number
  now: number
  delta: number
}

/**
 * The value page's data: a reading a day over the chosen period and the
 * cards that moved most, read again as copies come and go.
 */
export function useCollectionHistory(game: GameId) {
  const collection = useCollection(game)
  const period = ref<HistoryPeriod>('30')
  const { data, status, error, refresh } = useFetch<{ since: string, points: HistoryPoint[], movers: { gainers: Mover[], losers: Mover[] } }>('/api/collection/history', {
    query: { game, days: period },
    server: false,
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(collection.copies, () => {
    clearTimeout(timer)
    timer = setTimeout(() => void refresh(), 600)
  })

  const points = computed(() => data.value?.points ?? [])
  /** The change over the period: first reading to the last. */
  const change = computed(() => {
    const p = points.value
    if (p.length < 2)
      return null
    const delta = p.at(-1)!.value - p[0]!.value
    return { delta, pct: p[0]!.value ? delta / p[0]!.value : null, since: p[0]!.day }
  })
  return { period, status, error, refresh, points, change, movers: computed(() => data.value?.movers ?? { gainers: [], losers: [] }) }
}
