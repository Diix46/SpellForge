/**
 * Each generic-engine game's deck rules (`Record<TcgGameId, …>`: a game
 * added without its rules does not compile).
 */
import type { TcgRules } from './deck'
import type { TcgGameId } from './types'
import { POKEMON_RULES } from './games/pokemon'

export const TCG_RULES: Record<TcgGameId, TcgRules> = {
  pokemon: POKEMON_RULES,
}
