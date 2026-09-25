import { useState } from '#app'

/**
 * What an account unlocks. A guest browses the libraries and starts a deck
 * (kept in this browser, joined to the account on sign-in); these need one.
 */
export type MembersFeature = 'decks' | 'preview' | 'artwork'

// What to do once the guest has signed in (the click that asked for it). A
// function, so module state rather than useState: client-only, never sent.
let pending: (() => void) | null = null

/**
 * Gate for members-only features. `require(feature, action)` runs `action`
 * for a member; a guest gets the sign-up dialog saying why, and the action
 * runs once signed in (AuthModal calls runPending). Closing the dialog
 * forgets it.
 */
export function useMembersOnly() {
  const { loggedIn } = useUserSession()
  const { show } = useAuthOverlay()
  const reason = useState<MembersFeature | null>('auth-reason', () => null)

  function require(feature: MembersFeature, action?: () => void): boolean {
    if (loggedIn.value) {
      action?.()
      return true
    }
    reason.value = feature
    pending = action ?? null
    show('register')
    return false
  }

  function runPending() {
    const action = pending
    forget()
    action?.()
  }

  function forget() {
    pending = null
    reason.value = null
  }

  return { loggedIn, reason, require, runPending, forget }
}
