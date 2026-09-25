import type { GameId } from '#shared/game'

// The universe changes with the page on screen (see useUniverse), and so
// does the frame of the home page (full width, its own footer): both would
// otherwise dress the old page while it leaves. A page
// with a transition switches it as it enters, after the old page has left
// (app.vue's <NuxtPage> calls showPage from onBeforeEnter, before the new
// page is inserted); a page without one as it mounts (useShowUniverseOnMount).
// Coming from a page without a transition, the new page enters without one
// too: page:finish, once it has rendered.
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  const shown = useState<GameId | null>('universe', () => router.currentRoute.value.meta.universe ?? null)
  const home = useState<boolean>('page-home', () => router.currentRoute.value.path === '/')
  const showPage = () => {
    home.value = router.currentRoute.value.path === '/'
    shown.value = router.currentRoute.value.meta.universe ?? null
    // useHead writes <html data-universe> a tick later, after the new page
    // has painted once in the old universe: set it now (same value).
    if (import.meta.client) {
      // Likewise the home page's frame: Vue re-renders the shell after the
      // new page has painted once in the old frame.
      document.querySelector('.app-shell')?.classList.toggle('app-shell--bare', home.value)
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
      showPage()
  })
  return { provide: { showPage } }
})
