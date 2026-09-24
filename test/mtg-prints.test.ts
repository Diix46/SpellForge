import type { PrintOption } from '../shared/mtg/prints'
import { existsSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { listPrints } from '../server/utils/cards/mtg-prints'
import { pickPrint, printKey, setCoverage } from '../shared/mtg/prints'
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

it('printKey lowercases the set', () => {
  expect(printKey('SLD', '2288')).toBe('sld/2288')
})

const DB = '.data/cards-mtg.db'
const withDb = existsSync(DB) ? describe : describe.skip

withDb('listPrints', () => {
  const db = openCardDb()
  afterAll(() => db.close())

  it('tells low-resolution scans apart and serves a large image for the preview', async () => {
    const prints = await listPrints(db, 'Krenko, Mob Boss', 'fr')
    expect(prints.length).toBeGreaterThan(0)
    expect(prints.every(p => p.lang === 'fr')).toBe(true)
    expect(prints.some(p => !p.highres)).toBe(true)
    expect(prints[0]!.imageLarge).toMatch(/^\/api\/images\/mtg\/large\/front\//)
  })
})
