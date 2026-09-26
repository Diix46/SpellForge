import type { Ref } from 'vue'
import type { CollectionCopy, Condition, Finish } from '#shared/collection'
import { computed, reactive, watch } from 'vue'
import { unitValue } from '#shared/collection'

export type CollectionSort = 'recent' | 'name' | 'value' | 'set'
export type CollectionViewMode = 'grid' | 'list'

export interface CollectionFilters {
  q: string
  /** 'all' for no filter (a select cannot hold an empty value). */
  set: string
  finish: Finish | 'all'
  condition: Condition | 'all'
  rarity: string
  sort: CollectionSort
  view: CollectionViewMode
}

const VIEW_KEY = 'prism_collection_view'
const RARITY_ORDER = ['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus']

/**
 * What the collection page shows of the copies: filtered (text over the name,
 * set and location; set, finish, condition, rarity), sorted, and the choices
 * each filter offers — only those the collection holds.
 */
export function useCollectionView(copies: Ref<CollectionCopy[]>, lang: Ref<'fr' | 'en'>) {
  const filters = reactive<CollectionFilters>({ q: '', set: 'all', finish: 'all', condition: 'all', rarity: 'all', sort: 'recent', view: 'grid' })

  // The grid or the list, as last chosen in this browser.
  if (import.meta.client) {
    try {
      const saved = localStorage.getItem(VIEW_KEY)
      if (saved === 'grid' || saved === 'list')
        filters.view = saved
    }
    catch {}
    watch(() => filters.view, (v) => {
      try {
        localStorage.setItem(VIEW_KEY, v)
      }
      catch {}
    })
  }

  const nameOf = (c: CollectionCopy) => (lang.value === 'fr' ? c.card?.printedName : null) ?? c.card?.name ?? ''

  const sets = computed(() => {
    const m = new Map<string, { code: string, name: string, icon: string | null, releasedAt: string }>()
    for (const c of copies.value) {
      if (c.card && !m.has(c.card.set))
        m.set(c.card.set, { code: c.card.set, name: c.card.setName ?? c.card.set.toUpperCase(), icon: c.card.setIcon, releasedAt: c.card.releasedAt ?? '' })
    }
    return [...m.values()].sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))
  })
  const rarities = computed(() => {
    const found = new Set(copies.value.map(c => c.card?.rarity).filter((r): r is string => !!r))
    const rank = (r: string) => (RARITY_ORDER.includes(r) ? RARITY_ORDER.indexOf(r) : RARITY_ORDER.length)
    return [...found].sort((a, b) => rank(a) - rank(b))
  })

  const shown = computed(() => {
    const q = filters.q.trim().toLowerCase()
    const list = copies.value.filter((c) => {
      if (filters.set !== 'all' && c.card?.set !== filters.set)
        return false
      if (filters.finish !== 'all' && c.finish !== filters.finish)
        return false
      if (filters.condition !== 'all' && c.condition !== filters.condition)
        return false
      if (filters.rarity !== 'all' && c.card?.rarity !== filters.rarity)
        return false
      if (q) {
        const hay = [nameOf(c), c.card?.name, c.card?.setName, c.card?.set, c.location, c.note].join('\n').toLowerCase()
        if (!hay.includes(q))
          return false
      }
      return true
    })
    const value = (c: CollectionCopy) => (unitValue(c.card, c.finish) ?? -1) * c.quantity
    const num = (n: string) => Number.parseInt(n, 10) || 0
    if (filters.sort === 'name')
      list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    else if (filters.sort === 'value')
      list.sort((a, b) => value(b) - value(a))
    else if (filters.sort === 'set')
      list.sort((a, b) => (b.card?.releasedAt ?? '').localeCompare(a.card?.releasedAt ?? '') || (a.card?.set ?? '').localeCompare(b.card?.set ?? '') || num(a.card?.number ?? '') - num(b.card?.number ?? ''))
    // 'recent': the server's order, most recently touched first.
    return list
  })

  const active = computed(() => !!filters.q.trim() || [filters.set, filters.finish, filters.condition, filters.rarity].some(f => f !== 'all'))
  function reset() {
    Object.assign(filters, { q: '', set: 'all', finish: 'all', condition: 'all', rarity: 'all' })
  }

  return { filters, sets, rarities, shown, active, reset, nameOf }
}
