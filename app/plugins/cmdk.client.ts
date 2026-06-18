import { useCommandPalette } from '~/composables/useCommandPalette'

// Owns the single global ⌘K / Ctrl-K (+ Esc) keyboard binding. A plugin runs
// exactly once per client load, and we remove the listener on HMR dispose so
// dev never accumulates stale handlers closing over old composable instances.
export default defineNuxtPlugin(() => {
  const { open, toggle, hide } = useCommandPalette()

  function onKeydown(e: KeyboardEvent) {
    const k = e.key.toLowerCase()
    if ((e.metaKey || e.ctrlKey) && k === 'k') {
      e.preventDefault()
      toggle()
    }
    else if (k === 'escape' && open.value) {
      hide()
    }
  }

  window.addEventListener('keydown', onKeydown)

  if (import.meta.hot)
    import.meta.hot.dispose(() => window.removeEventListener('keydown', onKeydown))
})
