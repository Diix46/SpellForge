import type { GameId } from '#shared/game'
import { computed } from 'vue'
import { DEFAULT_GAME, parseGameId } from '#shared/game'

/**
 * The game the member plays most, chosen on the account page: the Collection
 * link and a new deck start in it when no game is on screen. A cookie, so
 * the server renders the bar with it.
 */
export function useFavoriteGame() {
  const cookie = useCookie<string | null>('prism_game', { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', default: () => null })
  const favorite = computed<GameId | null>({
    get: () => parseGameId(cookie.value),
    set: (g) => {
      cookie.value = g
    },
  })
  /** The favourite, or the site's default game. */
  const preferred = computed<GameId>(() => favorite.value ?? DEFAULT_GAME)
  return { favorite, preferred }
}
