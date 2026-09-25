import type { GameId } from '#shared/game'

// The universe changes with the page on screen (see useUniverse). A page
// with a transition switches it as it enters, after the old page has left
// (app.vue's <NuxtPage> calls showUniverse from onBeforeEnter, before the new
// page is inserted); a page without one as it mounts (useShowUniverseOnMount).
// Coming from a page without a transition, the new page enters without one
// too: page:finish, once it has rendered.
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  const shown = useState<GameId | null>('universe', () => router.currentRoute.value.meta.universe ?? null)
  const showUniverse = () => {
    shown.value = router.currentRoute.value.meta.universe ?? null
    // useHead writes <html data-universe> a tick later, after the new page
    // has painted once in the old universe: set it now (same value).
    if (import.meta.client) {
      if (shown.value)
        document.documentElement.dataset.universe = shown.value
      else
        delete document.documentElement.dataset.universe
    }
  }
  let untransitioned = false
  router.beforeEach((to, from) => {
    untransitioned = to.meta.pageTransition === false || from.meta.pageTransition === false
  })
  nuxtApp.hook('page:finish', () => {
    if (untransitioned)
      showUniverse()
  })
  return { provide: { showUniverse } }
})
