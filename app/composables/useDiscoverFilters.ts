import type { Ref } from 'vue'
import type { GameId } from '#shared/game'
import type { DeckFingerprint } from './useDeckFingerprints'
import { computed, reactive } from 'vue'

/** A public deck as the Discover gallery lists it. */
export interface DiscoverDeck {
  id: string
  name: string
  game: GameId
  raw: string
  owner: string
  createdAt: number
  updatedAt: number
}

export type DiscoverSort = 'recent' | 'name' | 'size'
export type DiscoverPeriod = 'all' | '7' | '30' | '365'

export interface DiscoverFilters {
  q: string
  game: GameId | 'all'
  /** Colour letters (Magic, "C" colourless) or One Piece colour names. */
  colors: string[]
  complete: boolean
  period: DiscoverPeriod
  sort: DiscoverSort
}

const DAY = 86_400_000

/**
 * The gallery's filters, all applied in the browser (the list is small and
 * the answer instant): text over the deck's name, its commander or Leader,
 * its author and the cards it holds; game; colours (the deck has every colour
 * picked); complete decks only; how recent; the order.
 */
export function useDiscoverFilters(decks: Ref<DiscoverDeck[]>, fingerprints: Ref<Map<string, DeckFingerprint>>) {
  const filters = reactive<DiscoverFilters>({ q: '', game: 'all', colors: [], complete: false, period: 'all', sort: 'recent' })

  const colorsOf = (d: DiscoverDeck, fp?: DeckFingerprint) =>
    d.game === 'mtg' ? (fp?.mana ?? []) : ((fp?.leader?.colors ?? []) as string[])

  const active = computed(() => !!(filters.q.trim() || filters.game !== 'all' || filters.colors.length || filters.complete || filters.period !== 'all'))

  const results = computed(() => {
    const q = filters.q.trim().toLowerCase()
    const since = filters.period === 'all' ? 0 : Date.now() - Number(filters.period) * DAY
    const list = decks.value.filter((d) => {
      const fp = fingerprints.value.get(d.id)
      if (filters.game !== 'all' && d.game !== filters.game)
        return false
      if (filters.complete && !fp?.complete)
        return false
      if (since && d.updatedAt < since)
        return false
      if (filters.colors.length) {
        const has = colorsOf(d, fp)
        if (!filters.colors.every(c => has.includes(c)))
          return false
      }
      if (q) {
        const hay = [d.name, d.owner, fp?.lead ?? '', d.raw].join('\n').toLowerCase()
        if (!hay.includes(q))
          return false
      }
      return true
    })
    const size = (d: DiscoverDeck) => fingerprints.value.get(d.id)?.count ?? 0
    const name = (d: DiscoverDeck) => d.name.toLowerCase()
    if (filters.sort === 'name')
      list.sort((a, b) => name(a).localeCompare(name(b)))
    else if (filters.sort === 'size')
      list.sort((a, b) => size(b) - size(a))
    else
      list.sort((a, b) => b.updatedAt - a.updatedAt)
    return list
  })

  function reset() {
    Object.assign(filters, { q: '', game: 'all', colors: [], complete: false, period: 'all' })
  }

  return { filters, results, active, reset }
}
