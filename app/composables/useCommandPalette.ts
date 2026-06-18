import { useState } from '#app'

// Global ⌘K / Ctrl-K command palette open state. Shared singleton (useState),
// so any component can open it and the binding is registered exactly once.
export function useCommandPalette() {
  const open = useState('cmdk-open', () => false)
  const bound = useState('cmdk-bound', () => false)

  function toggle() {
    open.value = !open.value
  }
  function show() {
    open.value = true
  }
  function hide() {
    open.value = false
  }

  // Register the global key handler once (client only).
  if (import.meta.client && !bound.value) {
    bound.value = true
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault()
        toggle()
      }
      if (k === 'escape' && open.value)
        hide()
    })
  }

  return { open, toggle, show, hide }
}
