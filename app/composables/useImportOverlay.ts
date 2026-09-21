import type { GameId } from '#shared/game'
import { ref, shallowRef } from 'vue'

/**
 * The one import/export dialog, opened from anywhere: the top bar, the
 * dashboard, or the workshop of an open deck.
 *
 * A deck page registers itself as a target while it is on screen, so the
 * dialog can offer to replace the open list instead of only creating a deck,
 * and can hand back its text for the export side. Registration happens in
 * `onMounted`, so none of this state is ever written while the server renders.
 */

export interface ImportTarget {
  game: GameId
  /** Shown on the "replace this deck" choice, read when the dialog opens. */
  name: () => string
  /** The open deck's list, for copying, downloading and pre-filling. */
  read: () => string
  /** Replaces the open deck's list. */
  write: (raw: string) => void
}

const open = ref(false)
const game = ref<GameId>('mtg')
const target = shallowRef<ImportTarget | null>(null)
/** True when the dialog was opened from the deck it would replace. */
const fromTarget = ref(false)

export function useImportOverlay() {
  function show(options: { game?: GameId, fromTarget?: boolean } = {}) {
    game.value = options.game ?? target.value?.game ?? game.value
    fromTarget.value = options.fromTarget ?? false
    open.value = true
  }
  function hide() {
    open.value = false
  }
  /** Called by a deck page for as long as it is on screen. */
  function registerTarget(deck: ImportTarget) {
    target.value = deck
  }
  function clearTarget() {
    target.value = null
    fromTarget.value = false
  }
  return { open, game, target, fromTarget, show, hide, registerTarget, clearTarget }
}
