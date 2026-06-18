// Keep the deck store in sync with auth state:
// - on login (or initial load while already logged in): migrate any guest decks
//   to the cloud once, then load the cloud set.
// - on logout: fall back to the (now likely empty) localStorage set.
export default defineNuxtPlugin(() => {
  const { loggedIn } = useUserSession()
  const store = useDeckStore()

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
