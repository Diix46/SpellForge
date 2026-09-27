/**
 * Each generic-engine game's deck rules (`Record<TcgGameId, …>`: a game
 * added without its rules does not compile).
 */
import type { TcgRules } from './deck'
import type { TcgGameId } from './types'
import { POKEMON_RULES } from './games/pokemon'
import { RIFTBOUND_RULES } from './games/riftbound'
import { YUGIOH_RULES } from './games/yugioh'

export const TCG_RULES: Record<TcgGameId, TcgRules> = {
  pokemon: POKEMON_RULES,
  yugioh: YUGIOH_RULES,
  riftbound: RIFTBOUND_RULES,
}
