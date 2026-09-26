import type { CollectionCopy, CollectionSummary, Condition, Finish } from '#shared/collection'
import type { GameId } from '#shared/game'
import { computed } from 'vue'
import { summarize } from '#shared/collection'

export interface NewCopy {
  printingId: string
  finish: Finish
  condition: Condition
  quantity: number
  purchasePrice?: number | null
  location?: string | null
  note?: string | null
}

export type CopyEdit = Partial<Omit<NewCopy, 'printingId'>>

/** A printing to pick when adding copies. */
export interface PrintChoice {
  /** The collection's printing id (One Piece: `lang:art`). */
  printingId: string
  image: string | null
  set: string
  setName: string
  setIcon: string | null
  rarity: string | null
  number: string
  lang: string
  price: string | null
  finishes: Finish[]
  priceFoil: string | null
}

/**
 * A member's collection for one game, shared by every view of it (the page,
 * the add dialog, the card detail): loaded once, kept in step with each edit,
 * the server's answer replacing the local guess.
 */
export function useCollection(game: GameId) {
  const copies = useState<CollectionCopy[]>(`collection-${game}`, () => [])
  const loaded = useState(`collection-${game}-loaded`, () => false)
  const loading = useState(`collection-${game}-loading`, () => false)
  const error = useState<string | null>(`collection-${game}-error`, () => null)
  const toast = useToast()
  const { t } = useLocale()

  const summary = computed<CollectionSummary>(() => summarize(copies.value))

  function put(copy: CollectionCopy | null, removed?: string) {
    let next = copies.value.filter(c => c.id !== removed && c.id !== copy?.id)
    if (copy)
      next = [copy, ...next]
    copies.value = next
  }

  const message = (e: unknown) => (e as { data?: { message?: string } })?.data?.message ?? t('collection.error')

  async function load(force = false) {
    if ((loaded.value && !force) || loading.value)
      return
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ copies: CollectionCopy[] }>('/api/collection', { query: { game } })
      copies.value = res.copies
      loaded.value = true
    }
    catch (e) {
      error.value = message(e)
    }
    finally {
      loading.value = false
    }
  }

  async function add(copy: NewCopy): Promise<CollectionCopy | null> {
    try {
      const res = await $fetch<{ copy: CollectionCopy }>('/api/collection', { method: 'POST', body: { game, ...copy } })
      put(res.copy)
      return res.copy
    }
    catch (e) {
      toast.add({ title: message(e), color: 'error', icon: 'i-lucide-circle-alert' })
      return null
    }
  }

  async function update(id: string, edit: CopyEdit): Promise<boolean> {
    const before = copies.value
    // Shown at once; the server's line (merged or removed) replaces it.
    if (edit.quantity === 0)
      copies.value = before.filter(c => c.id !== id)
    else
      copies.value = before.map(c => (c.id === id ? { ...c, ...edit } as CollectionCopy : c))
    try {
      const res = await $fetch<{ copy: CollectionCopy | null, removed?: string }>(`/api/collection/${encodeURIComponent(id)}`, { method: 'PATCH', body: edit })
      put(res.copy, res.removed)
      return true
    }
    catch (e) {
      copies.value = before
      toast.add({ title: message(e), color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    }
  }

  async function remove(id: string): Promise<boolean> {
    const before = copies.value
    copies.value = before.filter(c => c.id !== id)
    try {
      await $fetch(`/api/collection/${encodeURIComponent(id)}`, { method: 'DELETE' })
      return true
    }
    catch (e) {
      copies.value = before
      toast.add({ title: message(e), color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    }
  }

  /**
   * Several lines at once: removed, or given a condition or a location. The
   * server may merge lines (a condition another line has), so the collection
   * is read again after.
   */
  async function bulk(ids: string[], change: { action: 'delete' } | { action: 'edit', fields: { condition?: Condition, location?: string | null } }): Promise<boolean> {
    const before = copies.value
    if (change.action === 'delete')
      copies.value = before.filter(c => !ids.includes(c.id))
    try {
      await $fetch('/api/collection/bulk', { method: 'POST', body: { ids, ...change } })
      await load(true)
      return true
    }
    catch (e) {
      copies.value = before
      toast.add({ title: message(e), color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    }
  }

  /** Copies owned of each printing, all finishes and conditions together. */
  const ownedByPrinting = computed(() => {
    const m = new Map<string, number>()
    for (const c of copies.value)
      m.set(c.printingId, (m.get(c.printingId) ?? 0) + c.quantity)
    return m
  })

  return { copies, loaded, loading, error, summary, ownedByPrinting, load, add, update, remove, bulk }
}
