import type { ScryfallCard } from '../app/composables/scryfall/types'
import type { GameCard } from '../app/types/cards'
import { describe, expect, it } from 'vitest'
import { mtgRaw, toMtgCard } from '../app/composables/scryfall/toGameCard'

function scry(over: Partial<ScryfallCard>): ScryfallCard {
  return {
    id: 'print-1',
    name: 'Sol Ring',
    lang: 'en',
    set: 'cmd',
    set_name: 'Commander',
    collector_number: '261',
    layout: 'normal',
    ...over,
  }
}

describe('toMtgCard', () => {
  it('lifts the fields the app reads onto the neutral model', () => {
    const raw = scry({ type_line: 'Artifact', cmc: 1, color_identity: [] })
    const card = toMtgCard(raw)
    expect(card).toMatchObject({ game: 'mtg', id: 'print-1', name: 'Sol Ring', cmc: 1, typeLine: 'Artifact', colorIdentity: [] })
    expect(card.raw).toBe(raw)
  })

  it('falls back to the front face type line when the root one is missing', () => {
    // Defensive path: real double-faced cards DO carry a combined root line
    // ("A — X // B — Y"). This covers partial card objects, and pins the
    // adapter to englishTypeLine's exact fallback order.
    const raw = scry({
      name: 'Delver of Secrets // Insectile Aberration',
      layout: 'transform',
      card_faces: [
        { name: 'Delver of Secrets', type_line: 'Creature — Human Wizard' },
        { name: 'Insectile Aberration', type_line: 'Creature — Human Insect' },
      ],
    })
    expect(toMtgCard(raw).typeLine).toBe('Creature — Human Wizard')
  })

  it('falls back to the printed type line as a last resort', () => {
    expect(toMtgCard(scry({ printed_type_line: 'Artefact' })).typeLine).toBe('Artefact')
  })

  it('normalises missing optional fields instead of leaving undefined', () => {
    const card = toMtgCard(scry({}))
    expect(card.cmc).toBeNull()
    expect(card.colorIdentity).toEqual([])
    expect(card.typeLine).toBe('')
  })
})

describe('mtgRaw', () => {
  it('returns the Scryfall payload for a Magic card', () => {
    const raw = scry({})
    expect(mtgRaw(toMtgCard(raw))).toBe(raw)
  })

  it('returns null for an absent card', () => {
    expect(mtgRaw(null)).toBeNull()
    expect(mtgRaw(undefined)).toBeNull()
  })

  it('refuses to hand a non-Magic payload to Magic-only helpers', () => {
    const onePiece: GameCard = {
      game: 'optcg',
      id: 'OP01-001',
      name: 'Roronoa Zoro',
      cmc: null,
      colorIdentity: ['Red'],
      typeLine: 'Leader',
      raw: {},
    }
    expect(mtgRaw(onePiece)).toBeNull()
  })
})
