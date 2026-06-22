import { ref } from 'vue'

// Big floating card-preview on hover, used by the deck list rows + commander
// card. Pure viewport geometry (no Vue-component coupling), so it lives in a
// composable: a fixed-positioned BIG card that escapes the scroll container,
// height-driven (~70% of the viewport), clamped to the room beside the anchor
// row (prefers the left side, flips right when the left is too narrow).
// Extracted from DeckListPanel.

const CARD_RATIO = 88 / 63 // Magic card height ÷ width (standard sleeve aspect)

export interface CardPreview { src: string, x: number, y: number, w: number, h: number }

export function useCardPreview() {
  const preview = ref<CardPreview | null>(null)

  function position(src: string, anchor: HTMLElement) {
    const row = anchor.getBoundingClientRect()
    const gap = 16
    // Target a tall card; cap height to the viewport and width to the space left
    // of the panel (fall back to the right side if the left is too narrow).
    let h = Math.min(window.innerHeight * 0.7, 620)
    let w = h / CARD_RATIO
    const roomLeft = row.left - gap * 2
    const roomRight = window.innerWidth - row.right - gap * 2
    const room = Math.max(roomLeft, roomRight)
    if (w > room) {
      w = Math.max(200, room) // never go absurdly small
      h = w * CARD_RATIO
    }
    // Prefer the left side; flip right when the left doesn't fit.
    const x = roomLeft >= w ? row.left - w - gap : row.right + gap
    const y = Math.min(Math.max(8, row.top + row.height / 2 - h / 2), window.innerHeight - h - 8)
    preview.value = { src, x, y, w, h }
  }

  /** Show the preview for an image anchored to the hovered element. No-op if no image. */
  function show(src: string | null | undefined, e: MouseEvent) {
    if (src)
      position(src, e.currentTarget as HTMLElement)
  }

  function hide() {
    preview.value = null
  }

  return { preview, show, hide }
}
