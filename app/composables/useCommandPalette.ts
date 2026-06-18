import { useState } from '#app'

// Global ⌘K command palette open state. Pure shared state (useState singleton);
// the global keyboard binding lives in plugins/cmdk.client.ts so its lifecycle
// is owned in one place (and torn down/rebound cleanly on HMR).
export function useCommandPalette() {
  const open = useState('cmdk-open', () => false)

  function toggle() {
    open.value = !open.value
  }
  function show() {
    open.value = true
  }
  function hide() {
    open.value = false
  }

  return { open, toggle, show, hide }
}
