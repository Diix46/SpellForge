/**
 * Pokémon TCG deck rules — the rulebook's deck construction (Scarlet &
 * Violet / Mega Evolution era):
 *
 * - exactly 60 cards;
 * - at most 4 copies of a card by name, Basic Energy aside;
 * - at least one Basic Pokémon;
 * - at most one ACE SPEC card, and at most one Radiant Pokémon.
 *
 * Legality per format comes with the data (TCGdex, maintained at each
 * rotation): Standard, then Expanded.
 */
import type { TcgIssue, TcgLine, TcgRules } from '../deck'
import type { TcgCard } from '../types'

export const POKEMON_DECK_SIZE = 60
const MAX_COPIES = 4

/** The nine basic Energy types, in the names printings use (scripts/ingest-pokemon.mjs). */
const BASIC_ENERGY = /^(?:basic )?(?:grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy) energy$/

export function isBasicEnergy(card: TcgCard): boolean {
  return card.category === 'Energy' && (card.subtype === 'Normal' || card.subtype === 'Basic' || BASIC_ENERGY.test(card.key))
}
export const isBasicPokemon = (card: TcgCard) => card.category === 'Pokemon' && (card.subtype === 'Basic' || card.subtype === 'Baby')
export const isAceSpec = (card: TcgCard) => !!card.rarity?.toUpperCase().includes('ACE SPEC')
export const isRadiant = (card: TcgCard) => card.key.startsWith('radiant ')

/** Distinct cards and their copies satisfying `test`. */
function among(lines: readonly TcgLine[], test: (c: TcgCard) => boolean) {
  const names = new Set<string>()
  let n = 0
  for (const l of lines) {
    if (l.card && test(l.card)) {
      names.add(l.card.name)
      n += l.entry.quantity
    }
  }
  return { names: [...names], n }
}

export const POKEMON_RULES: TcgRules = {
  zones: [{ id: 'main', min: POKEMON_DECK_SIZE, max: POKEMON_DECK_SIZE }],
  formats: ['standard', 'expanded'],
  zoneFor: () => 'main',
  copyLimit: card => (isBasicEnergy(card) ? Infinity : MAX_COPIES),
  refuse(lines, card) {
    if (isAceSpec(card) && among(lines, isAceSpec).n >= 1)
      return 'aceSpec'
    if (isRadiant(card) && among(lines, isRadiant).n >= 1)
      return 'radiant'
    return null
  },
  check(lines) {
    const issues: TcgIssue[] = []
    if (lines.some(l => l.card) && !lines.some(l => l.card && isBasicPokemon(l.card)))
      issues.push({ code: 'noBasicPokemon', level: 'error' })
    const ace = among(lines, isAceSpec)
    if (ace.n > 1)
      issues.push({ code: 'aceSpec', level: 'error', cards: ace.names, count: ace.n, max: 1 })
    const radiant = among(lines, isRadiant)
    if (radiant.n > 1)
      issues.push({ code: 'radiant', level: 'error', cards: radiant.names, count: radiant.n, max: 1 })
    return issues
  },
}
