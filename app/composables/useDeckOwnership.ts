import type { Ref } from 'vue'
import type { OwnedCount } from '#shared/collection'
import type { GameId } from '#shared/game'
import { computed, onMounted, watch } from 'vue'
import { deckOwnership, ownershipKey } from '#shared/collection'

/**
 * A deck against the member's collection: how many of each card are owned,
 * the share of the deck owned, what is left to get. Members only (the
 * collection lives in the account); for guests, `active` stays false.
 *
 * `needs` names each card as the collection does (see ownershipKey).
 */
export function useDeckOwnership(game: GameId, needs: Ref<{ name: string, quantity: number }[]>) {
  const { loggedIn } = useAuth()
  const collection = useCollection(game)

  onMounted(() => {
    if (loggedIn.value)
      void collection.load()
  })
  watch(loggedIn, (v) => {
    if (v)
      void collection.load(true)
  })

  const have = computed(() => {
    const m = new Map<string, number>()
    for (const c of collection.copies.value) {
      const name = game === 'mtg' ? c.card?.name : c.card?.number
      if (!name)
        continue
      const key = ownershipKey(game, name)
      m.set(key, (m.get(key) ?? 0) + c.quantity)
    }
    return m
  })

  const result = computed(() => deckOwnership(needs.value.map(n => ({ key: ownershipKey(game, n.name), quantity: n.quantity })), have.value))
  /** Shown once there is a collection to compare with, and a deck. */
  const active = computed(() => loggedIn.value && collection.loaded.value && result.value.total > 0)

  function ownedOf(name: string): OwnedCount | null {
    return active.value ? result.value.byKey.get(ownershipKey(game, name)) ?? null : null
  }
  /** Copies of a card still to get. */
  function missingOf(name: string): number {
    const c = result.value.byKey.get(ownershipKey(game, name))
    return c ? c.need - c.have : 0
  }
  const summary = computed(() => (active.value ? { owned: result.value.owned, total: result.value.total } : null))

  /**
   * Deck lines cut down to the copies still to get: a card on several lines
   * (main deck and sideboard) has what is missing spread over them in order.
   */
  function keepMissing<T>(items: readonly T[], nameOf: (item: T) => string, quantityOf: (item: T) => number, withQuantity: (item: T, quantity: number) => T): T[] {
    const left = new Map<string, number>()
    const out: T[] = []
    for (const item of items) {
      const key = ownershipKey(game, nameOf(item))
      const missing = left.get(key) ?? missingOf(nameOf(item))
      const quantity = Math.min(quantityOf(item), missing)
      left.set(key, missing - quantity)
      if (quantity > 0)
        out.push(withQuantity(item, quantity))
    }
    return out
  }

  return { active, ownedOf, missingOf, keepMissing, summary }
}
