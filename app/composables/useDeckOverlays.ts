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
    // What the query SHOULD be for the current overlay state (preview wins).
    const wantPreview = p ? '1' : undefined
    const wantBuy = !p && b ? '1' : undefined
    // No-op guard: on deck (re)init both overlays are written to false, producing
    // the SAME query as now. Issuing router.replace() with an identical query
    // during the in-flight SPA navigation that is mounting this page ABORTS that
    // navigation — the page slot stays empty and onMounted never fires (white
    // page). Only sync when the query actually changes (a real open/close/toggle).
    if (route.query.preview === wantPreview && route.query.buy === wantBuy)
      return
    const q = { ...route.query }
    delete q.preview
    delete q.buy
    if (wantPreview)
      q.preview = wantPreview
    else if (wantBuy)
      q.buy = wantBuy
    router.replace({ query: q })
  }, {
    // flush:'post' runs the sync AFTER the component has mounted, so it can never
    // fire inside the in-flight navigation that mounts this page (belt-and-braces
    // with the no-op guard above — together they keep SPA deck-open from aborting).
    flush: 'post',
  })

  return { previewOpen, buyOpen, coachOpen }
}
