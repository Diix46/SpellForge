import { computed, ref, shallowRef } from 'vue'

// Generic snapshot-stack undo/redo. The deck page uses this over the raw
// decklist text + name — since the raw decklist is the deck's single source
// of truth (see ARCHITECTURE.md), one snapshot stack covers every kind of
// edit (cards, quantities, commander, rename) without hooking into each
// individual builder operation.
export function useUndoHistory<T>(limit = 50) {
  // shallowRef: snapshots are replaced wholesale (never mutated in place), so
  // deep reactivity would only add proxy overhead for no benefit.
  const stack = shallowRef<T[]>([])
  const cursor = ref(-1)

  const canUndo = computed(() => cursor.value > 0)
  const canRedo = computed(() => cursor.value >= 0 && cursor.value < stack.value.length - 1)

  /** Start a fresh history at `initial` (e.g. when switching decks). */
  function reset(initial: T) {
    stack.value = [initial]
    cursor.value = 0
  }

  /** Record a new state, discarding any redo branch beyond the cursor. */
  function push(snapshot: T) {
    const truncated = stack.value.slice(0, cursor.value + 1)
    truncated.push(snapshot)
    if (truncated.length > limit)
      truncated.shift()
    stack.value = truncated
    cursor.value = truncated.length - 1
  }

  /** Move one step back and return that snapshot, or null if already at the start. */
  function undo(): T | null {
    if (!canUndo.value)
      return null
    cursor.value--
    return stack.value[cursor.value] ?? null
  }

  /** Move one step forward and return that snapshot, or null if already at the end. */
  function redo(): T | null {
    if (!canRedo.value)
      return null
    cursor.value++
    return stack.value[cursor.value] ?? null
  }

  return { canUndo, canRedo, reset, push, undo, redo }
}
