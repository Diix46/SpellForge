import { computed, ref } from 'vue'
import { useCardDnd } from '~/composables/useCardDnd'

// Drop-zone behaviour for the deck list panel: dragging a SEARCH card onto the
// panel adds it. Highlight only while a search card is in flight (not when
// dragging deck rows out). Extracted from DeckListPanel.
//
// `onDropAdd` is called with the dropped card's (raw) name when a search card
// is released over the zone.
export function useDeckListDropZone(onDropAdd: (name: string) => void) {
  const { dragging, readDrop } = useCardDnd()

  const dropActive = ref(false)
  const canDropHere = computed(() => dragging.value === 'search')

  function onDragOver(e: DragEvent) {
    if (!canDropHere.value)
      return
    e.preventDefault()
    if (e.dataTransfer)
      e.dataTransfer.dropEffect = 'move'
    dropActive.value = true
  }
  function onDragLeave(e: DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node))
      dropActive.value = false
  }
  function onDrop(e: DragEvent) {
    dropActive.value = false
    const payload = readDrop(e)
    if (payload?.source === 'search' && payload.name)
      onDropAdd(payload.name)
  }

  return { dropActive, canDropHere, onDragOver, onDragLeave, onDrop }
}
