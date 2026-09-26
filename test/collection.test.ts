import type { CollectionCard, CollectionCopy } from '../shared/collection'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { collectionCards } from '../server/utils/collection/cards'
import { isCondition, isFinish, optcgPrintingId, parseOptcgPrintingId, summarize, unitValue } from '../shared/collection'

function card(extra: Partial<CollectionCard> = {}): CollectionCard {
  return {
    name: 'Sol Ring',
    printedName: null,
    lang: 'en',
    set: 'cmm',
    setName: 'Commander Masters',
    setIcon: null,
    number: '400',
    rarity: 'uncommon',
    releasedAt: '2023-08-04',
    typeLine: 'Artifact',
    colors: [],
    manaCost: '{1}',
    image: '',
    thumb: '',
    price: 1.5,
    priceFoil: 4,
    finishes: ['nonfoil', 'foil'],
    ...extra,
  }
}

function copy(extra: Partial<CollectionCopy> = {}): CollectionCopy {
  return {
    id: 'c_1',
    game: 'mtg',
    printingId: 'p1',
    finish: 'nonfoil',
    condition: 'NM',
    quantity: 1,
    purchasePrice: null,
    location: null,
    note: null,
    createdAt: 0,
    updatedAt: 0,
    card: card(),
    ...extra,
  }
}

describe('collection values', () => {
  it('prices a copy in its own finish, else the nonfoil price', () => {
    expect(unitValue(card(), 'nonfoil')).toBe(1.5)
    expect(unitValue(card(), 'foil')).toBe(4)
    expect(unitValue(card({ priceFoil: null }), 'etched')).toBe(1.5)
    expect(unitValue(null, 'foil')).toBeNull()
  })

  it('sums copies, cards, printings, value and what was paid', () => {
    const s = summarize([
      copy({ quantity: 3, purchasePrice: 1 }),
      copy({ id: 'c_2', finish: 'foil', quantity: 1 }),
      copy({ id: 'c_3', printingId: 'p2', quantity: 2, card: card({ price: null, priceFoil: null }) }),
      copy({ id: 'c_4', printingId: 'p3', card: card({ name: 'Blood Moon', price: 20 }) }),
    ])
    expect(s).toEqual({ copies: 7, cards: 2, printings: 3, value: 28.5, paid: 3, unpriced: 2 })
  })
})

describe('collection fields', () => {
  it('knows the finishes and conditions', () => {
    expect(isFinish('etched')).toBe(true)
    expect(isFinish('shiny')).toBe(false)
    expect(isCondition('NM')).toBe(true)
    expect(isCondition('nm')).toBe(false)
  })

  it('carries a One Piece copy\'s language in its printing id', () => {
    expect(optcgPrintingId('fr', 'OP01-016_p1')).toBe('fr:OP01-016_p1')
    expect(parseOptcgPrintingId('fr:OP01-016_p1')).toEqual({ lang: 'fr', artId: 'OP01-016_p1' })
    expect(parseOptcgPrintingId('OP01-016')).toBeNull()
  })
})

describe.skipIf(!existsSync('.data/cards-mtg.db'))('collection cards from the card database', () => {
  it('describes a printing with its set, finishes and prices', async () => {
    const { createClient } = await import('@libsql/client')
    const db = createClient({ url: 'file:.data/cards-mtg.db' })
    const { rows } = await db.execute(`SELECT id FROM printings WHERE set_code = 'blb' AND lang = 'en' AND finishes = 3 LIMIT 1`)
    db.close()
    const id = String(rows[0]!.id)
    const got = (await collectionCards('mtg', [id, 'no-such-printing'])).get(id)!
    expect(got.set).toBe('blb')
    expect(got.setName).toBe('Bloomburrow')
    expect(got.setIcon).toBe('/api/images/sets/blb.svg')
    expect(got.finishes).toEqual(['nonfoil', 'foil'])
    expect(got.image).toContain(`/api/images/mtg/normal/front/${id}.jpg`)
  })
})
