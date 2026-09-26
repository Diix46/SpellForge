import { describe, expect, it } from 'vitest'
import { deckImportRows, preconImportRows, preconKind } from '../shared/collection-decks'

describe('precons into a collection', () => {
  const cards = [
    { section: 'commander' as const, count: 1, name: 'Ghalta, Primal Hunger', set: 'pca', number: '1', scryfallId: 'sf-1', foil: true },
    { section: 'mainBoard' as const, count: 10, name: 'Forest', set: 'pca', number: '99', scryfallId: 'sf-2', foil: false },
  ]

  it('keeps the box\'s exact printing and foiling', () => {
    expect(preconImportRows(cards, 'en')[0]).toMatchObject({ printingId: 'sf-1', set: 'pca', number: '1', finish: 'foil', quantity: 1, lang: 'en' })
  })

  it('asks for the French printing of the same set and number', () => {
    expect(preconImportRows(cards, 'fr', 'Boîte Ghalta')[1]).toMatchObject({ printingId: null, set: 'pca', number: '99', lang: 'fr', quantity: 10, location: 'Boîte Ghalta' })
  })

  it('sorts decks into families', () => {
    expect(preconKind('Commander Deck')).toBe('commander')
    expect(preconKind('Secret Lair Drop')).toBe('secretlair')
    expect(preconKind('Theme Deck')).toBe('other')
  })
})

describe('a deck into a collection', () => {
  const raw = '1 Sol Ring (CMM) 400\n4 Island\n1 Blood Moon\n\nSideboard\n2 Island'

  it('takes the whole deck, pinned printings kept', () => {
    const rows = deckImportRows('mtg', raw, 'fr')
    expect(rows.map(r => [r.name, r.quantity, r.set, r.number, r.lang])).toEqual([
      ['Sol Ring', 1, 'cmm', '400', 'fr'],
      ['Island', 4, null, null, 'fr'],
      ['Blood Moon', 1, null, null, 'fr'],
      ['Island', 2, null, null, 'fr'],
    ])
  })

  it('or only what the collection lacks, across main deck and sideboard', () => {
    const owned = new Map([['sol ring', 3], ['island', 5]])
    const rows = deckImportRows('mtg', raw, 'en', { owned })
    expect(rows.map(r => [r.name, r.quantity])).toEqual([['Blood Moon', 1], ['Island', 1]])
  })

  it('keeps a One Piece deck\'s pinned art in the copy\'s language', () => {
    const rows = deckImportRows('optcg', '1 OP01-001\n4 OP01-016_p1\n4 OP01-013', 'fr', { owned: new Map([['OP01-013', 4]]) })
    expect(rows.map(r => [r.name, r.printingId, r.quantity])).toEqual([['OP01-001', null, 1], ['OP01-016', 'fr:OP01-016_p1', 4]])
  })
})
