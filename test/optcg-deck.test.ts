import type { OptcgDeckLine } from '../shared/optcg/deck'
import type { OptcgCard } from '../shared/optcg/types'
import { describe, expect, it } from 'vitest'
import { canAdd, copiesOf, deckStats, findLeader, validateLines } from '../shared/optcg/deck'

function card(number: string, over: Partial<OptcgCard> = {}): OptcgCard {
  return {
    id: number,
    number,
    lang: 'fr',
    name: number,
    category: 'Character',
    colors: ['Red'],
    rarity: 'Common',
    cost: 2,
    life: null,
    power: 3000,
    counter: 1000,
    attributes: [],
    types: [],
    effect: null,
    trigger: null,
    set: 'OP-09',
    block: 3,
    banned: false,
    variants: 1,
    image: '',
    thumb: '',
    ...over,
  }
}
const line = (c: OptcgCard, quantity = 1, art?: string): OptcgDeckLine => ({ entry: { quantity, name: c.number, art }, card: c })
const zoro = card('OP01-001', { category: 'Leader', colors: ['Red'], cost: null, life: 5, power: 5000, counter: null, block: 2 })

describe('one Piece deckbuilding', () => {
  it('finds the leader wherever it sits in the list', () => {
    const lines = [line(card('OP09-010'), 4), line(zoro)]
    expect(findLeader(lines)?.card?.number).toBe('OP01-001')
    expect(findLeader([line(card('OP09-010'))])).toBeNull()
  })

  it('counts alternate arts together', () => {
    const lines = [line(card('OP09-010'), 3), line(card('OP09-010', { id: 'OP09-010_p1' }), 1, 'OP09-010_p1')]
    expect(copiesOf(lines, 'OP09-010')).toBe(4)
    expect(canAdd(lines, card('OP09-010'))).toEqual({ ok: false, reason: 'maxCopies' })
  })

  it('takes any leader into the leader slot, and refuses off-colour or banned cards', () => {
    const lines = [line(zoro)]
    expect(canAdd(lines, card('OP02-001', { category: 'Leader', colors: ['Blue'] }))).toEqual({ ok: true, asLeader: true })
    expect(canAdd(lines, card('OP09-050', { colors: ['Blue'] }))).toEqual({ ok: false, reason: 'offColor' })
    expect(canAdd(lines, card('OP06-116', { banned: true }))).toEqual({ ok: false, reason: 'banned' })
    expect(canAdd(lines, card('OP09-010'))).toEqual({ ok: true, asLeader: false })
    // Without a leader, colours are not checked yet.
    expect(canAdd([], card('OP09-050', { colors: ['Blue'] }))).toEqual({ ok: true, asLeader: false })
  })

  it('validates the resolved deck, skipping lines still loading', () => {
    const lines: OptcgDeckLine[] = [
      line(zoro),
      ...Array.from({ length: 12 }, (_, i) => line(card(`OP09-0${10 + i}`), 4)),
      line(card('OP09-030'), 2),
      { entry: { quantity: 3, name: 'OP99-999' }, card: null },
    ]
    expect(validateLines(lines)).toEqual({ legal: true, count: 50, issues: [] })
  })

  it('computes the curve, counters and triggers outside the leader', () => {
    const lines = [
      line(zoro),
      line(card('A-001', { cost: 1, counter: 2000 }), 4),
      line(card('A-002', { cost: 12, counter: null, trigger: '[Trigger] Draw 1' }), 2),
      line(card('A-003', { category: 'Event', cost: 2, counter: null, power: null }), 3),
    ]
    const s = deckStats(lines)
    expect(s.count).toBe(9)
    expect(s.byCategory).toEqual({ Character: 6, Event: 3, Stage: 0 })
    expect(s.curve[1]).toBe(4)
    expect(s.curve[10]).toBe(2)
    expect(s.curve[2]).toBe(3)
    expect(s.counters).toEqual({ none: 2, c1000: 0, c2000: 4 })
    expect(s.triggers).toBe(2)
    expect(s.averageCost).toBe(Math.round(((4 * 1 + 2 * 12 + 3 * 2) / 9) * 10) / 10)
  })
})
