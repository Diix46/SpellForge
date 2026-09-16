// Keep the deck store in sync with auth state:
// - on login (or initial load while already logged in): migrate any guest decks
//   to the cloud once, then load the cloud set.
// - on logout: fall back to the (now likely empty) localStorage set.
export default defineNuxtPlugin(() => {
  const { loggedIn } = useUserSession()
  const store = useDeckStore()

  // A server-rendered page hands over the store as the server saw it: no
  // guest decks, since they live in this browser. Read them before anything
  // can write that empty list back.
  if (!loggedIn.value)
    store.refresh()

  watch(loggedIn, async (isIn, was) => {
    if (isIn) {
      // Block the deck-page guard until the cloud set has actually loaded.
      store.ready.value = false
      await store.migrateLocalToCloud()
      await store.syncFromCloud()
    }
    else if (was) {
      store.refresh()
    }
  }, { immediate: true })
})
