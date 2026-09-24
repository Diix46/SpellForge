import type { PrintOption } from '../shared/mtg/prints'
import { existsSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { listPrints } from '../server/utils/cards/mtg-prints'
import { displayable, pickPrint, pinFor, pinPrintKey, printKey, samePin, setCoverage } from '../shared/mtg/prints'
import { openCardDb } from './support/card-db'

function print(set: string, collectorNumber: string, releasedAt: string, extra: Partial<PrintOption> = {}): PrintOption {
  return {
    id: `${set}-${collectorNumber}`,
    set,
    setName: set.toUpperCase(),
    collectorNumber,
    lang: 'fr',
    image: null,
    imageLarge: null,
    priceEur: null,
    promo: false,
    highres: true,
    releasedAt,
    artist: null,
    styles: [],
    ...extra,
  }
}

describe('pickPrint', () => {
  const prints = [
    print('ptk', '1', '2026-01-01', { promo: true }),
    print('m21', '10', '2020-07-03'),
    print('m21', '2', '2020-07-03'),
    print('4ed', '5', '1995-04-01'),
  ]

  it('clears the pin for the automatic choice', () => {
    expect(pickPrint(prints, { kind: 'auto' })).toBeNull()
  })

  it('picks the oldest and the newest, promos only as a last resort', () => {
    expect(pickPrint(prints, { kind: 'oldest' })?.set).toBe('4ed')
    expect(pickPrint(prints, { kind: 'newest' })?.set).toBe('m21')
    expect(pickPrint([prints[0]!], { kind: 'newest' })?.set).toBe('ptk')
  })

  it('pins the lowest collector number of a set, and leaves cards without it alone', () => {
    expect(pickPrint(prints, { kind: 'set', set: 'M21' })?.collectorNumber).toBe('2')
    expect(pickPrint(prints, { kind: 'set', set: 'khm' })).toBeUndefined()
    expect(pickPrint([], { kind: 'oldest' })).toBeUndefined()
  })
})

describe('setCoverage', () => {
  it('ranks sets by cards covered, then by recency, and drops single-card sets', () => {
    const byName = new Map([
      ['A', [print('m21', '1', '2020-07-03'), print('khm', '1', '2021-02-05')]],
      ['B', [print('m21', '2', '2020-07-03'), print('khm', '2', '2021-02-05'), print('khm', '3', '2021-02-05')]],
      ['C', [print('m21', '3', '2020-07-03'), print('4ed', '1', '1995-04-01')]],
    ])
    expect(setCoverage(byName)).toEqual([
      { set: 'm21', setName: 'M21', cards: 3 },
      { set: 'khm', setName: 'KHM', cards: 2 },
    ])
  })
})

describe('pins and languages', () => {
  const fr = print('lrw', '155', '2007-10-12', { lang: 'fr', highres: false })
  const en = print('lrw', '155', '2007-10-12', { lang: 'en' })

  it('keys a printing by set, number and language', () => {
    expect(printKey('SLD', '2288', 'en')).toBe('sld/2288@en')
    expect(printKey('lrw', '155', 'fr')).not.toBe(printKey('lrw', '155', 'en'))
  })

  it('marks "[EN]" only an English printing of a card that exists in the deck language', () => {
    expect(pinFor(en, 'fr', [fr, en])).toEqual({ set: 'lrw', collectorNumber: '155', lang: 'en' })
    expect(pinFor(fr, 'fr', [fr, en])).toEqual({ set: 'lrw', collectorNumber: '155' })
    expect(pinFor(en, 'en', [fr, en])).toEqual({ set: 'lrw', collectorNumber: '155' })
    // Printed in English only: it shows in English anyway, no marker needed.
    expect(pinFor(en, 'fr', [en])).toEqual({ set: 'lrw', collectorNumber: '155' })
  })

  it('reads a pin in the deck language unless marked', () => {
    expect(pinPrintKey({ set: 'LRW', collectorNumber: '155' }, 'fr')).toBe('lrw/155@fr')
    expect(pinPrintKey({ set: 'LRW', collectorNumber: '155', lang: 'en' }, 'fr')).toBe('lrw/155@en')
    expect(pinPrintKey({}, 'fr')).toBe('')
  })

  it('compares pins as written, set in any case', () => {
    expect(samePin({ set: 'LRW', collectorNumber: '155' }, { set: 'lrw', collectorNumber: '155' })).toBe(true)
    expect(samePin({ set: 'LRW', collectorNumber: '155' }, { set: 'lrw', collectorNumber: '155', lang: 'en' })).toBe(false)
  })

  it('shows the deck language on its own, English when it has none', () => {
    expect(displayable([fr, en], 'fr')).toEqual([fr])
    expect(displayable([en], 'fr')).toEqual([en])
  })

  it('picks the best English printing for "all in English", sharp scans first', () => {
    const blurry = print('evg', '54', '2014-12-05', { lang: 'en', highres: false })
    expect(pickPrint([fr, blurry, en], { kind: 'english' })).toBe(en)
    expect(pickPrint([fr, blurry], { kind: 'english' })).toBe(blurry)
    expect(pickPrint([fr], { kind: 'english' })).toBeUndefined()
  })
})

const DB = '.data/cards-mtg.db'
const withDb = existsSync(DB) ? describe : describe.skip

withDb('listPrints', () => {
  const db = openCardDb()
  afterAll(() => db.close())

  it('adds the English printings after the French ones on demand', async () => {
    const own = await listPrints(db, 'Boggart Shenanigans', 'fr')
    const all = await listPrints(db, 'Boggart Shenanigans', 'fr', true)
    expect(own.every(p => p.lang === 'fr')).toBe(true)
    expect(all.length).toBeGreaterThan(own.length)
    const firstEnglish = all.findIndex(p => p.lang === 'en')
    expect(firstEnglish).toBe(own.length)
    expect(all.slice(firstEnglish).every(p => p.lang === 'en')).toBe(true)
  })

  it('tells low-resolution scans apart and serves a large image for the preview', async () => {
    const prints = await listPrints(db, 'Krenko, Mob Boss', 'fr')
    expect(prints.length).toBeGreaterThan(0)
    expect(prints.every(p => p.lang === 'fr')).toBe(true)
    expect(prints.some(p => !p.highres)).toBe(true)
    expect(prints[0]!.imageLarge).toMatch(/^\/api\/images\/mtg\/large\/front\//)
  })
})
