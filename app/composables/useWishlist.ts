import type { Finish, WishItem } from '#shared/collection'
import type { GameId } from '#shared/game'
import { computed } from 'vue'
import { wishReached } from '#shared/collection'

export interface WishEdit {
  anyPrinting?: boolean
  quantity?: number
  targetPrice?: number | null
  note?: string | null
}

/**
 * A member's wishlist for one game, shared by every view (the wishlist tab,
 * the card sheets, the checklists): loaded once, kept in step with each edit.
 */
export function useWishlist(game: GameId) {
  const items = useState<WishItem[]>(`wishlist-${game}`, () => [])
  const loaded = useState(`wishlist-${game}-loaded`, () => false)
  const loading = useState(`wishlist-${game}-loading`, () => false)
  const toast = useToast()
  const { t } = useLocale()
  const message = (e: unknown) => (e as { data?: { message?: string } })?.data?.message ?? t('collection.error')

  async function load(force = false) {
    if ((loaded.value && !force) || loading.value)
      return
    loading.value = true
    try {
      items.value = (await $fetch<{ items: WishItem[] }>('/api/collection/wishlist', { query: { game } })).items
      loaded.value = true
    }
    catch {}
    finally {
      loading.value = false
    }
  }

  function put(item: WishItem) {
    items.value = [item, ...items.value.filter(i => i.id !== item.id)]
  }

  async function add(printingId: string, opts: { finish?: Finish, anyPrinting?: boolean } = {}): Promise<boolean> {
    try {
      const { item } = await $fetch<{ item: WishItem }>('/api/collection/wishlist', { method: 'POST', body: { game, printingId, anyPrinting: opts.anyPrinting ?? true, finish: opts.finish ?? 'nonfoil' } })
      put(item)
      toast.add({ title: t('collection.wish.added'), color: 'success', icon: 'i-lucide-heart' })
      return true
    }
    catch (e) {
      toast.add({ title: message(e), color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    }
  }

  async function update(id: string, edit: WishEdit) {
    const before = items.value
    items.value = before.map(i => (i.id === id ? { ...i, ...edit } : i))
    try {
      const { item } = await $fetch<{ item: WishItem }>(`/api/collection/wishlist/${encodeURIComponent(id)}`, { method: 'PATCH', body: edit })
      items.value = items.value.map(i => (i.id === id ? item : i))
    }
    catch (e) {
      items.value = before
      toast.add({ title: message(e), color: 'error', icon: 'i-lucide-circle-alert' })
    }
  }

  async function remove(id: string) {
    const before = items.value
    items.value = before.filter(i => i.id !== id)
    try {
      await $fetch(`/api/collection/wishlist/${encodeURIComponent(id)}`, { method: 'DELETE' })
    }
    catch (e) {
      items.value = before
      toast.add({ title: message(e), color: 'error', icon: 'i-lucide-circle-alert' })
    }
  }

  /** Printings wished, to mark them where cards are shown. */
  const wished = computed(() => new Set(items.value.map(i => i.printingId)))
  /** Wishes whose price came down to their target. */
  const reached = computed(() => items.value.filter(wishReached))

  return { items, loaded, loading, load, add, update, remove, wished, reached }
}
