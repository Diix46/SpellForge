import { useState } from 'nuxt/app'

// Shared contract for dragging cards between the search grid and the deck list.
// Payload travels in dataTransfer; a mirrored useState flag drives drop-zone
// highlighting (dataTransfer payload isn't readable during dragover for security,
// so we keep the active source in reactive state to decide which zone lights up).

export const DND_MIME = 'application/x-spellforge-card'

export interface CardDragPayload {
  source: 'search' | 'deck'
  name: string
}

export function useCardDnd() {
  // Which side a drag started from (null = no drag in progress). Lets a panel
  // highlight only when a *droppable* card is being dragged over it.
  const dragging = useState<'search' | 'deck' | null>('card-dnd-source', () => null)

  function startDrag(e: DragEvent, payload: CardDragPayload) {
    if (!e.dataTransfer)
      return
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(DND_MIME, JSON.stringify(payload))
    // Plain-text fallback (some browsers/screen-readers expect text/plain).
    e.dataTransfer.setData('text/plain', payload.name)
    dragging.value = payload.source
  }

  function endDrag() {
    dragging.value = null
  }

  /** Read the payload from a drop event (null if it isn't one of ours). */
  function readDrop(e: DragEvent): CardDragPayload | null {
    const raw = e.dataTransfer?.getData(DND_MIME)
    if (!raw)
      return null
    try {
      return JSON.parse(raw) as CardDragPayload
    }
    catch {
      return null
    }
  }

  return { dragging, startDrag, endDrag, readDrop }
}
