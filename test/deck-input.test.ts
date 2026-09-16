import { describe, expect, it } from 'vitest'
import { deckGame, deckId, DeckInputError, deckName, deckRaw, deckSource, deckTime, MAX_DECK_NAME, MAX_DECK_RAW } from '../server/utils/deckInput'

describe('deck input', () => {
  it('keeps plausible values and bounds the rest', () => {
    expect(deckName('  Atraxa  ')).toBe('Atraxa')
    expect(deckName('x'.repeat(500))).toHaveLength(MAX_DECK_NAME)
    expect(deckName(undefined)).toBeUndefined()
    expect(deckSource(null)).toBeNull()
    expect(deckSource('y'.repeat(900))).toHaveLength(500)
  })

  it('refuses what cannot be stored', () => {
    expect(() => deckRaw('z'.repeat(MAX_DECK_RAW + 1))).toThrow(DeckInputError)
    expect(() => deckName(42)).toThrow(DeckInputError)
    expect(() => deckId('a/b?c#d')).toThrow(DeckInputError)
    expect(() => deckGame('pokemon')).toThrow(DeckInputError)
  })

  it('reads games and ids as the client sends them', () => {
    expect(deckGame(undefined)).toBe('mtg')
    expect(deckGame('optcg')).toBe('optcg')
    expect(deckId('d_ab12cd34mu4372fm')).toBe('d_ab12cd34mu4372fm')
    expect(deckId('')).toBeUndefined()
  })

  it('keeps client timestamps only when plausible', () => {
    const now = Date.UTC(2026, 8, 16)
    expect(deckTime(now - 1000, now)).toBe(now - 1000)
    expect(deckTime(now + 3_600_000, now)).toBe(now)
    expect(deckTime(0, now)).toBe(now)
    expect(deckTime('12', now)).toBe(now)
  })
})
