/**
 * Bounds on what a client may store in a deck. Pure, for the tests; the
 * routes turn a refusal into a 400.
 */
import type { GameId } from '../../shared/game'
import { parseGameId } from '../../shared/game'

/** Ids the client generates (`d_…`) and the ones this server does. */
export const DECK_ID_RE = /^[\w-]{1,64}$/
export const MAX_DECK_NAME = 120
/** A Commander list is a few kilobytes; this leaves room for notes and sideboards. */
export const MAX_DECK_RAW = 100_000
export const MAX_DECK_SOURCE = 500
/** Timestamps the client may carry over (guest decks moving to an account). */
const EARLIEST = Date.UTC(2020, 0, 1)

export class DeckInputError extends Error {}

export function deckName(value: unknown): string | undefined {
  if (value === undefined)
    return undefined
  if (typeof value !== 'string')
    throw new DeckInputError('name must be a string')
  return value.trim().slice(0, MAX_DECK_NAME)
}

export function deckRaw(value: unknown): string | undefined {
  if (value === undefined)
    return undefined
  if (typeof value !== 'string')
    throw new DeckInputError('raw must be a string')
  if (value.length > MAX_DECK_RAW)
    throw new DeckInputError('raw is too long')
  return value
}

export function deckSource(value: unknown): string | null | undefined {
  if (value === undefined || value === null)
    return value
  if (typeof value !== 'string')
    throw new DeckInputError('source must be a string')
  return value.slice(0, MAX_DECK_SOURCE)
}

/** Absent means Magic (older clients); anything else must be a known game. */
export function deckGame(value: unknown): GameId {
  if (value === undefined || value === null)
    return 'mtg'
  const game = parseGameId(value)
  if (!game)
    throw new DeckInputError('unknown game')
  return game
}

export function deckId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '')
    return undefined
  if (typeof value !== 'string' || !DECK_ID_RE.test(value))
    throw new DeckInputError('invalid id')
  return value
}

/** A client timestamp kept when plausible, else now. */
export function deckTime(value: unknown, now = Date.now()): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= EARLIEST && value <= now + 60_000
    ? Math.floor(value)
    : now
}
