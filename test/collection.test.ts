import type { CollectionCard, CollectionCopy } from '../shared/collection'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { setIconPath } from '../server/utils/cards/mtg-shape'
import { collectionCards } from '../server/utils/collection/cards'
import { optcgSetOrder, setChecklist, setProgress } from '../server/utils/collection/sets'
import { completion, deckOwnership, isCondition, isFinish, optcgPrintingId, ownershipKey, parseOptcgPrintingId, setKind, summarize, unitValue } from '../shared/collection'

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

describe('a deck against the collection', () => {
  it('matches Magic by front-face name and One Piece by number', () => {
    expect(ownershipKey('mtg', ' Delver of Secrets // Insectile Aberration')).toBe('delver of secrets')
    expect(ownershipKey('optcg', 'op01-016')).toBe('OP01-016')
  })

  it('counts owned copies up to what the deck needs', () => {
    const have = new Map([['sol ring', 3], ['island', 4]])
    const r = deckOwnership([{ key: 'sol ring', quantity: 1 }, { key: 'island', quantity: 10 }, { key: 'blood moon', quantity: 1 }, { key: 'island', quantity: 2 }], have)
    expect(r.byKey.get('sol ring')).toEqual({ need: 1, have: 1 })
    expect(r.byKey.get('island')).toEqual({ need: 12, have: 4 })
    expect(r.byKey.get('blood moon')).toEqual({ need: 1, have: 0 })
    expect({ owned: r.owned, total: r.total }).toEqual({ owned: 5, total: 14 })
  })
})

describe('set completion', () => {
  it('adds up owned and total cards over the sets', () => {
    expect(completion([{ owned: 10, total: 100 }, { owned: 2, total: 2 }])).toEqual({ owned: 12, total: 102, ratio: 12 / 102 })
    expect(completion([]).ratio).toBe(0)
  })

  it('sorts sets into families', () => {
    expect(setKind('mtg', 'expansion')).toBe('main')
    expect(setKind('mtg', 'commander')).toBe('commander')
    expect(setKind('mtg', 'funny')).toBe('other')
    expect(setKind('optcg', 'EB')).toBe('special')
    expect(setKind('optcg', null)).toBe('other')
  })

  it('lists One Piece sets boosters first, newest first', () => {
    expect(['ST-01', 'P', 'OP-01', 'EB-01', 'OP-10'].sort(optcgSetOrder)).toEqual(['OP-10', 'OP-01', 'EB-01', 'ST-01', 'P'])
  })

  it('serves a set symbol under its own file name, shared or not', () => {
    expect(setIconPath('https://svgs.scryfall.io/sets/star.svg?1789963200')).toBe('/api/images/sets/star.svg')
    expect(setIconPath(null)).toBeNull()
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

describe.skipIf(!existsSync('.data/cards-mtg.db'))('set completion from the card database', () => {
  it('counts a collector number once, whatever its language or copies', async () => {
    const { createClient } = await import('@libsql/client')
    const db = createClient({ url: 'file:.data/cards-mtg.db' })
    const { rows } = await db.execute(`SELECT en.id AS en, fr.id AS fr, other.id AS other FROM printings en
      JOIN printings fr ON fr.set_code = en.set_code AND fr.collector_number = en.collector_number AND fr.lang = 'fr'
      JOIN printings other ON other.set_code = en.set_code AND other.collector_number != en.collector_number AND other.lang = 'en'
      WHERE en.set_code = 'blb' AND en.lang = 'en' LIMIT 1`)
    db.close()
    const r = rows[0]!
    const lines = [{ printingId: String(r.en), quantity: 2 }, { printingId: String(r.fr), quantity: 1 }, { printingId: String(r.other), quantity: 1 }]
    const [blb] = await setProgress('mtg', lines, { all: false, lang: 'fr' })
    expect(blb).toMatchObject({ code: 'blb', name: 'Bloomburrow', owned: 2, total: 397 })

    const checklist = await setChecklist('mtg', 'blb', lines, 'fr')
    expect(checklist).toHaveLength(397)
    expect(checklist.filter(c => c.owned).map(c => c.owned).sort()).toEqual([1, 3])
    // In order, the French printing where there is one.
    expect(checklist[0]!.number).toBe('1')
    expect(checklist.find(c => c.owned === 3)!.printingId).toBe(String(r.fr))
  })
})
