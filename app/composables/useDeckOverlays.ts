import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { onBeforeUnmount, ref, watch } from 'vue'

// Overlay (Preview / Buy / Coach) open-state for the deck page, with Esc-to-close
// and ?preview / ?buy deep-link sync. Extracted from deck/[id].vue. The page owns
// when to *open* them (toolbar buttons, deep-link on init); this owns the wiring.

export function useDeckOverlays(route: RouteLocationNormalizedLoaded, router: Router) {
  // Preview & Buy are terminal actions (print / purchase). Their open state mirrors
  // to the route query so a finished deck's view/buy state is shareable.
  const previewOpen = ref(false)
  const buyOpen = ref(false)
  // Coach IA chat widget open state (separate Esc handling: it's a persistent
  // widget, not a terminal overlay).
  const coachOpen = ref(false)

  // Esc closes whichever terminal overlay is open (a div's @keydown.esc won't fire
  // unless focused, so bind at the window while one is open).
  function onOverlayEsc(e: KeyboardEvent) {
    if (e.key !== 'Escape')
      return
    if (previewOpen.value)
      previewOpen.value = false
    else if (buyOpen.value)
      buyOpen.value = false
  }
  watch([previewOpen, buyOpen], ([p, b]) => {
    if (!import.meta.client)
      return
    if (p || b)
      window.addEventListener('keydown', onOverlayEsc)
    else
      window.removeEventListener('keydown', onOverlayEsc)
  })

  function onCoachEsc(e: KeyboardEvent) {
    if (e.key === 'Escape')
      coachOpen.value = false
  }
  watch(coachOpen, (open) => {
    if (import.meta.client)
      open ? window.addEventListener('keydown', onCoachEsc) : window.removeEventListener('keydown', onCoachEsc)
  })

  onBeforeUnmount(() => {
    if (import.meta.client) {
      window.removeEventListener('keydown', onOverlayEsc)
      window.removeEventListener('keydown', onCoachEsc)
    }
  })

  // Deep-link: keep ?preview / ?buy in sync with the overlays. Only one at a time.
  watch([previewOpen, buyOpen], ([p, b]) => {
    const q = { ...route.query }
    delete q.preview
    delete q.buy
    if (p)
      q.preview = '1'
    else if (b)
      q.buy = '1'
    router.replace({ query: q })
  })

  return { previewOpen, buyOpen, coachOpen }
}
