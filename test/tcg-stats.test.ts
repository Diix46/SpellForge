import type { TcgLine } from '../shared/tcg/deck'
import type { TcgCard } from '../shared/tcg/types'
import { describe, expect, it } from 'vitest'
import { tcgDeckStats } from '../shared/tcg/stats'

function line(quantity: number, card: Partial<TcgCard> | null): TcgLine {
  return {
    entry: { quantity, name: 'x' },
    card: card ? { category: 'Unit', stats: {}, price: null, ...card } as TcgCard : null,
  }
}

describe('tcgDeckStats', () => {
  it('draws Riftbound\'s energy curve and prices the deck', () => {
    const s = tcgDeckStats('riftbound', [
      line(3, { stats: { energy: 2 }, price: 0.5 }),
      line(2, { stats: { energy: 5 }, price: 10, category: 'Spell' }),
      line(1, { stats: { energy: 12 }, price: null }),
    ])
    expect(s.count).toBe(6)
    expect(s.curve[2]).toBe(3)
    expect(s.curve[5]).toBe(2)
    expect(s.curve[10]).toBe(1)
    expect(s.averageCost).toBe(4.7)
    expect(s.price).toBe(21.5)
    expect(s.unpriced).toBe(1)
    expect(s.byCategory).toEqual([['Unit', 4], ['Spell', 2]])
  })

  it('reads a Yu-Gi-Oh! Rank or Link where there is no Level', () => {
    const s = tcgDeckStats('yugioh', [line(1, { stats: { rank: 4 } }), line(1, { stats: { link: 2 } }), line(2, { stats: {} })])
    expect(s.curve[4]).toBe(1)
    expect(s.curve[2]).toBe(1)
  })

  it('has no curve for Pokémon, and counts lines not resolved yet', () => {
    const s = tcgDeckStats('pokemon', [line(4, { stats: { hp: 120 } }), line(2, null)])
    expect(s.curve).toEqual([])
    expect(s.count).toBe(6)
  })
})
