import { GUEST_DECKS_V2 } from '#shared/decks'

// Keep the deck store in sync with auth state and with other tabs:
// - on sign-in (or a first load while signed in): move guest decks to the
//   account once, send what an earlier visit could not, then load the account.
// - on sign-out: back to this browser's guest decks.
// - a guest's other tab changed its decks: read them again.
export default defineNuxtPlugin(() => {
  const { loggedIn } = useUserSession()
  const store = useDeckStore()

  // A server-rendered page hands over the store as the server saw it: no
  // guest decks, since they live in this browser. Read them before anything
  // can write.
  if (!loggedIn.value)
    store.refresh()

  watch(loggedIn, async (isIn, was) => {
    if (isIn) {
      // Block the deck-page guard until the account's decks have loaded.
      store.ready.value = false
      await store.migrateLocalToCloud()
      await store.syncFromCloud()
    }
    else if (was) {
      store.refresh()
    }
  }, { immediate: true })

  window.addEventListener('storage', ({ key: changed }) => {
    if (changed === GUEST_DECKS_V2 && !loggedIn.value)
      store.refresh()
  })
})
