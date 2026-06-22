import { useState } from '#app'

// Global auth-modal open state + the tab it should land on (login / register).
// Shared singleton so the landing page (which renders outside the app shell) can
// trigger the AuthModal that lives at the app root. Mirrors useCommandPalette.

export type AuthMode = 'login' | 'register'

export function useAuthOverlay() {
  const open = useState('auth-open', () => false)
  const mode = useState<AuthMode>('auth-mode', () => 'login')

  function show(initial: AuthMode = 'login') {
    mode.value = initial
    open.value = true
  }
  function hide() {
    open.value = false
  }

  return { open, mode, show, hide }
}
