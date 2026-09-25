import type { GameId } from '#shared/game'
import { computed, onMounted } from 'vue'

/**
 * The game universe of the page on screen, from its `universe` page meta.
 * The shell calls it once to stamp <html data-universe>, which re-themes the
 * whole document (see assets/css/universes.css); components call it to pick
 * universe-specific content.
 *
 * It follows the page shown, not the route: during a navigation the route
 * changes first while the old page is still leaving, and the new universe
 * would dress it (plugins/universe.ts moves it once the new page is in).
 */
export function useUniverse() {
  const route = useRoute()
  const shown = useState<GameId | null>('universe', () => route.meta.universe ?? null)
  const universe = computed(() => shown.value)
  return { universe }
}

/**
 * For a universe page without a page transition: its universe comes in as
 * the page does. Under <Suspense>, `mounted` runs when the resolved page is
 * put in, in the same frame (page:finish comes a paint later).
 */
export function useShowUniverseOnMount() {
  const { $showUniverse } = useNuxtApp()
  onMounted(() => $showUniverse())
}
