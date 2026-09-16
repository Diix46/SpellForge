import { describe, expect, it } from 'vitest'
import { readEdhrecDeck } from '../server/utils/edhrecDeck'

describe('readEdhrecDeck', () => {
  it('reads the 2026 shape, commander first and not repeated', () => {
    const deck = readEdhrecDeck({
      header: 'Average Deck for Atraxa, Praetors\' Voice',
      deck: {
        commander: ['Atraxa, Praetors\' Voice'],
        commander_v2: [['Atraxa, Praetors\' Voice', 1]],
        cards: {
          Artifact: [['Sol Ring', 1], ['Arcane Signet', 1]],
          Land: [['Forest', 7], ['Atraxa, Praetors\' Voice', 1]],
        },
      },
    })
    expect(deck?.commanders).toEqual(['Atraxa, Praetors\' Voice'])
    expect(deck?.lines).toEqual(['1 Atraxa, Praetors\' Voice', '1 Sol Ring', '1 Arcane Signet', '7 Forest'])
    expect(deck?.cardCount).toBe(10)
  })

  it('still reads the older average-deck and preview shapes', () => {
    expect(readEdhrecDeck({ deck: ['1 Sol Ring', '10 Island', ''] })?.lines).toEqual(['1 Sol Ring', '10 Island'])
    const preview = readEdhrecDeck({ commanders: ['Kenrith, the Returned King'], cards: ['Sol Ring'] })
    expect(preview?.lines).toEqual(['1 Kenrith, the Returned King', '1 Sol Ring'])
  })

  it('returns null when there is nothing to import', () => {
    expect(readEdhrecDeck({ deck: { cards: {} } })).toBeNull()
    expect(readEdhrecDeck(null)).toBeNull()
    expect(readEdhrecDeck({ deck: { cards: { Land: [[42, 1], null] } } })).toBeNull()
  })
})
