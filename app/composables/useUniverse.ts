import type { GameId } from '#shared/game'
import { computed } from 'vue'

/**
 * The game universe of the current page, from its `universe` page meta.
 * The shell calls it once to stamp <html data-universe>, which re-themes the
 * whole document (see assets/css/universes.css); components call it to pick
 * universe-specific content.
 */
export function useUniverse() {
  const route = useRoute()
  const universe = computed<GameId | null>(() => route.meta.universe ?? null)
  return { universe }
}
