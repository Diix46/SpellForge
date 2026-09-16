import { describe, expect, it } from 'vitest'
import { assertProxyPrintable, CAPABILITIES, deckPath, gameFromSlug, libraryPath, parseGameId, sharedPath } from '../shared/game'

describe('game capabilities', () => {
  it('never prints One Piece proxies', () => {
    expect(CAPABILITIES.optcg.proxyPdf).toBe(false)
    expect(() => assertProxyPrintable(['mtg', 'optcg'])).toThrow(/optcg/)
  })

  it('prints Magic, and unresolved cards of a Magic deck', () => {
    expect(() => assertProxyPrintable(['mtg', undefined, null])).not.toThrow()
    expect(() => assertProxyPrintable([])).not.toThrow()
  })
})

describe('universe paths', () => {
  it('puts decks, shared decks and libraries under their universe', () => {
    expect(deckPath({ id: 'a b', game: 'optcg' })).toBe('/one-piece/deck/a%20b')
    expect(deckPath({ id: 'x' })).toBe('/magic/deck/x')
    expect(sharedPath('optcg', 's1')).toBe('/one-piece/shared/s1')
    expect(sharedPath(null, 's1')).toBe('/magic/shared/s1')
    expect(libraryPath('mtg')).toBe('/magic')
  })

  it('reads game ids and slugs strictly', () => {
    expect(parseGameId('optcg')).toBe('optcg')
    expect(parseGameId('pokemon')).toBeNull()
    expect(parseGameId(['mtg'])).toBeNull()
    expect(gameFromSlug('one-piece')).toBe('optcg')
    expect(gameFromSlug('toString')).toBeNull()
  })
})
