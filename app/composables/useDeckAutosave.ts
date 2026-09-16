import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted } from 'vue'
import { useUndoHistory } from './useUndoHistory'

interface Snapshot { raw: string, name: string }

/**
 * Debounced saving and undo/redo for a deck page, whatever the game: the raw
 * decklist and the name are the whole state, so one snapshot stack covers
 * every edit. Each settled save is one undo step; Ctrl/Cmd+Z and
 * Ctrl/Cmd+Shift+Z (or Ctrl+Y) work outside text fields.
 */
export function useDeckAutosave(options: {
  deckId: Ref<string>
  raw: Ref<string>
  name: Ref<string>
  delay?: number
}) {
  const { deckId, raw, name } = options
  const { getDeck, updateDeck } = useDeckStore()
  const history = useUndoHistory<Snapshot>()

  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: { id: string } & Snapshot | null = null
  // An undo/redo writes the refs too; saving that exact snapshot must not
  // become a new step. Any other content saved after it is a real edit.
  let restored: Snapshot | null = null

  const same = (a: Snapshot | null, b: Snapshot) => !!a && a.raw === b.raw && a.name === b.name

  function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!pending)
      return
    const { id, raw: r, name: n } = pending
    pending = null
    if (getDeck(id))
      updateDeck(id, { raw: r, name: n })
    const snapshot = { raw: r, name: n }
    if (!same(restored, snapshot))
      history.push(snapshot)
    restored = null
  }

  function schedule() {
    const id = deckId.value
    const current = getDeck(id)
    // Back to what is saved (a deck just loaded, or an edit undone by hand
    // before the delay): drop the pending write, or the intermediate state
    // would be saved after all.
    if (current && current.raw === raw.value && current.name === name.value) {
      pending = null
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      restored = null
      return
    }
    pending = { id, raw: raw.value, name: name.value }
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(flush, options.delay ?? 600)
  }

  /** Start fresh on a deck; flushes the previous deck's pending edit first. */
  function reset(snapshot: Snapshot) {
    flush()
    restored = null
    history.reset(snapshot)
  }

  function apply(snapshot: Snapshot | null) {
    if (!snapshot)
      return
    restored = snapshot
    raw.value = snapshot.raw
    name.value = snapshot.name
  }
  function undo() {
    flush()
    apply(history.undo())
  }
  function redo() {
    flush()
    apply(history.redo())
  }

  function isTextEntry(el: EventTarget | null) {
    return el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  }
  function onKeydown(e: KeyboardEvent) {
    const key = e.key.toLowerCase()
    if (!(e.metaKey || e.ctrlKey) || (key !== 'z' && key !== 'y') || isTextEntry(e.target))
      return
    e.preventDefault()
    if (key === 'y' || e.shiftKey)
      redo()
    else undo()
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    flush()
  })

  return { schedule, flush, reset, undo, redo, canUndo: history.canUndo, canRedo: history.canRedo }
}
