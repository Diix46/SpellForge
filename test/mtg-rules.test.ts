import type { DeckEntry } from '../shared/decklist'
import { describe, expect, it } from 'vitest'
import { validateCommander } from '../app/composables/useDeckBuilder'

const entry = (name: string, quantity = 1): DeckEntry => ({ quantity, name })

/** A 100-card list: the commander, 60 singletons and 39 basics. */
function deck(): DeckEntry[] {
  return [
    entry('Atraxa, Praetors\' Voice'),
    ...Array.from({ length: 60 }, (_, i) => entry(`Card ${i}`)),
    entry('Forest', 20),
    entry('Plains', 19),
  ]
}

describe('validateCommander', () => {
  it('accepts a legal 100-card singleton deck', () => {
    expect(validateCommander(deck(), { commanderName: 'Atraxa, Praetors\' Voice' })).toEqual([])
  })

  it('leaves tokens out of the hundred', () => {
    const list = [...deck(), entry('Goblin')]
    expect(validateCommander(list, { commanderName: 'x', tokenNames: new Set(['goblin']) })).toEqual([])
  })

  it('warns under 100 cards and errors over', () => {
    expect(validateCommander(deck().slice(1), { commanderName: 'x' })).toEqual([
      { level: 'warning', key: 'valid.size', value: 99 },
    ])
    expect(validateCommander([...deck(), entry('Extra')], { commanderName: 'x' })).toEqual([
      { level: 'error', key: 'valid.size', value: 101 },
    ])
  })

  it('enforces singleton, except basics and "any number" cards', () => {
    const list = deck()
    list[1] = entry('Card 0', 2)
    list[2] = entry('Relentless Rats', 1)
    list.pop()
    list.push(entry('Plains', 18))
    expect(validateCommander(list, { commanderName: 'x' })).toEqual([
      { level: 'error', key: 'valid.singleton', value: 'Card 0' },
    ])
    expect(validateCommander([entry('Relentless Rats', 30)], { commanderName: 'x' })
      .filter(i => i.key === 'valid.singleton')).toEqual([])
  })

  it('checks colour identity only for cards already resolved', () => {
    const identityByName = new Map([['card 0', ['R']], ['card 1', ['G', 'W']]])
    const issues = validateCommander(deck(), {
      commanderName: 'x',
      commanderIdentity: ['W', 'U', 'B', 'G'],
      identityByName,
    })
    // Card 2..59 are unknown: not flagged before they resolve.
    expect(issues).toEqual([{ level: 'error', key: 'valid.identity', value: 'Card 0' }])
  })

  it('asks for a commander', () => {
    expect(validateCommander(deck())).toEqual([{ level: 'warning', key: 'valid.noCommander' }])
  })
})
