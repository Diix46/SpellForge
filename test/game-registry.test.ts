import { describe, expect, it } from 'vitest'
import { can, cardPath, collectionPath, GAME_IDS, GAME_LIST, gameFromSlug, GAMES, parseGameId } from '../shared/game'

describe('the game registry', () => {
  it('lists every game once, in order, each with its own slug', () => {
    expect(GAME_IDS).toEqual(GAME_LIST.map(g => g.id))
    expect(new Set(GAME_LIST.map(g => g.slug)).size).toBe(GAME_LIST.length)
    for (const g of GAME_LIST) {
      expect(GAMES[g.id]).toBe(g)
      expect(gameFromSlug(g.slug)).toBe(g.id)
      expect(parseGameId(g.id)).toBe(g.id)
      expect(g.exportFormats).toContain('prism')
    }
    expect(parseGameId('chess')).toBeNull()
  })

  it('answers what a game allows, and builds its addresses', () => {
    expect(can('mtg', 'prices')).toBe(true)
    expect(can('optcg', 'proxyPdf')).toBe(false)
    expect(can(null, 'prices')).toBe(false)
    expect(cardPath('mtg', 'Delver of Secrets // Insectile Aberration')).toBe('/magic/card/Delver%20of%20Secrets')
    expect(cardPath('optcg', 'OP01-016')).toBe('/one-piece/card/OP01-016')
    expect(collectionPath('optcg', '/sets/OP-01')).toBe('/one-piece/collection/sets/OP-01')
  })
})

describe('every game has its pieces', () => {
  it('has a collection adapter', async () => {
    const { COLLECTION_GAMES } = await import('../server/utils/collection/games')
    expect([...COLLECTION_GAMES].sort()).toEqual([...GAME_IDS].sort())
  })
})
