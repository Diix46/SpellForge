import type { OptcgColor, OptcgDeckEntry, OptcgRuleCard } from '../shared/optcg/rules'
import { describe, expect, it } from 'vitest'
import { validateOptcgDeck } from '../shared/optcg/rules'

function card(number: string, over: Partial<OptcgRuleCard> = {}): OptcgRuleCard {
  return { number, category: 'Character', colors: ['Red'], block: 3, banned: false, ...over }
}
const leader = (number: string, colors: OptcgColor[] = ['Red']) => card(number, { category: 'Leader', colors })

/** A legal 50-card red list: 12 cards x4 + 1 card x2. */
function legalList(): OptcgDeckEntry[] {
  const list = Array.from({ length: 12 }, (_, i) => ({ card: card(`OP09-0${String(i + 10)}`), quantity: 4 }))
  list.push({ card: card('OP09-030'), quantity: 2 })
  return list
}

describe('validateOptcgDeck', () => {
  it('accepts a legal deck', () => {
    const v = validateOptcgDeck(leader('OP09-001'), legalList())
    expect(v).toEqual({ legal: true, count: 50, issues: [] })
  })

  it('requires exactly one leader and exactly 50 cards', () => {
    const v = validateOptcgDeck(null, legalList().slice(1))
    expect(v.issues).toEqual([{ code: 'noLeader' }, { code: 'deckSize', count: 46, expected: 50 }])
    expect(validateOptcgDeck(card('OP09-002'), legalList()).issues).toEqual([{ code: 'notALeader', number: 'OP09-002' }])
  })

  it('counts alternate arts together against the four-copy limit', () => {
    const list = legalList()
    // Two entries of the same number: 4 + 1 = 5 copies, though no line says 5.
    list[12] = { card: card('OP09-010'), quantity: 1 }
    list.push({ card: card('OP09-031'), quantity: 1 })
    const v = validateOptcgDeck(leader('OP09-001'), list)
    expect(v.issues).toEqual([{ code: 'tooManyCopies', number: 'OP09-010', count: 5, max: 4 }])
  })

  it('keeps every colour of a card within the leader\'s colours', () => {
    const list = legalList()
    list[0] = { card: card('OP09-010', { colors: ['Red', 'Green'] }), quantity: 4 }
    expect(validateOptcgDeck(leader('OP09-001'), list).issues).toEqual([
      { code: 'offColor', number: 'OP09-010', colors: ['Red', 'Green'] },
    ])
    // The same card is fine under a red-green leader.
    expect(validateOptcgDeck(leader('OP09-001', ['Red', 'Green']), list).legal).toBe(true)
  })

  it('refuses a second leader in the deck', () => {
    const list = legalList()
    list[12] = { card: leader('OP01-001'), quantity: 1 }
    list.push({ card: card('OP09-031'), quantity: 1 })
    expect(validateOptcgDeck(leader('OP09-001'), list).issues).toEqual([{ code: 'leaderInDeck', number: 'OP01-001' }])
  })

  it('wants exactly one copy of the Leader', () => {
    expect(validateOptcgDeck(leader('OP09-001'), legalList(), 4).issues).toEqual([{ code: 'leaderCount', number: 'OP09-001', count: 4 }])
    expect(validateOptcgDeck(leader('OP09-001'), legalList(), 1).legal).toBe(true)
  })

  it('flags banned and rotated cards, the leader included', () => {
    const list = legalList()
    list[0] = { card: card('OP06-116', { banned: true }), quantity: 4 }
    list[1] = { card: card('OP01-016', { block: 1 }), quantity: 4 }
    const v = validateOptcgDeck(leader('OP01-001', ['Red']), list)
    expect(v.issues).toEqual([
      { code: 'banned', number: 'OP06-116' },
      { code: 'rotated', number: 'OP01-016', block: 1 },
    ])
    expect(validateOptcgDeck({ ...leader('OP01-001'), block: 1 }, legalList()).issues).toEqual([
      { code: 'rotated', number: 'OP01-001', block: 1 },
    ])
  })

  it('treats a card too new to carry a block as legal', () => {
    const list = legalList()
    list[0] = { card: card('OP17-005', { block: null }), quantity: 4 }
    expect(validateOptcgDeck(leader('OP09-001'), list).legal).toBe(true)
  })

  it('forbids banned pairs, counting the leader as part of the deck', () => {
    const list = legalList()
    list[0] = { card: card('OP11-067'), quantity: 4 }
    expect(validateOptcgDeck(leader('OP11-040'), list).issues).toEqual([
      { code: 'bannedPair', numbers: ['OP11-040', 'OP11-067'] },
    ])
    // Either card alone is fine.
    expect(validateOptcgDeck(leader('OP09-001'), list).legal).toBe(true)
  })
})
