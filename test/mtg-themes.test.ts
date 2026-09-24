import type { PrintOption } from '../shared/mtg/prints'
import { existsSync, readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { MTG_SCHEMA_VERSION } from '../server/utils/cards/db'
import { listPrints } from '../server/utils/cards/mtg-prints'
import { buildPrintsQuery } from '../server/utils/cards/mtg-query'
import { ART_STYLES, pickPrint, stylesOf, themeCoverage } from '../shared/mtg/prints'
import { openCardDb } from './support/card-db'

function print(set: string, lang: string, releasedAt: string, extra: Partial<PrintOption> = {}): PrintOption {
  return {
    id: `${set}-${lang}`,
    set,
    setName: set.toUpperCase(),
    collectorNumber: '1',
    lang,
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

describe('the ingest and the app agree', () => {
  const ingest = readFileSync('scripts/ingest-mtg.mjs', 'utf8')

  it('on the schema version the boot rebuild compares', () => {
    expect(ingest).toContain(`const SCHEMA_VERSION = '${MTG_SCHEMA_VERSION}'`)
  })

  it('on the style bits', () => {
    const bits = /const STYLE = (\{[^}]+\})/.exec(ingest)?.[1]
    expect(bits).toBeDefined()
    // eslint-disable-next-line no-new-func
    expect(new Function(`return ${bits}`)()).toEqual(ART_STYLES)
  })
})

describe('themes', () => {
  it('reads a style mask', () => {
    expect(stylesOf(ART_STYLES.fullart | ART_STYLES.oldframe)).toEqual(['fullart', 'oldframe'])
    expect(stylesOf(0)).toEqual([])
  })

  it('picks the look in the deck language first, then in English', () => {
    const frFull = print('unh', 'fr', '2020-01-01', { styles: ['fullart'], highres: false })
    const enFull = print('zen', 'en', '2021-01-01', { styles: ['fullart'] })
    const frPlain = print('m21', 'fr', '2022-01-01')
    expect(pickPrint([frPlain, frFull, enFull], { kind: 'style', style: 'fullart' }, 'fr')).toBe(frFull)
    expect(pickPrint([frPlain, enFull], { kind: 'style', style: 'fullart' }, 'fr')).toBe(enFull)
    expect(pickPrint([frPlain], { kind: 'style', style: 'fullart' }, 'fr')).toBeUndefined()
  })

  it('picks by artist the same way', () => {
    const guay = print('ulg', 'en', '1999-02-15', { artist: 'Rebecca Guay' })
    expect(pickPrint([print('m21', 'fr', '2022-01-01'), guay], { kind: 'artist', artist: 'Rebecca Guay' }, 'fr')).toBe(guay)
  })

  it('counts the cards each theme reaches, dropping one-card artists', () => {
    const byName = new Map([
      ['A', [print('a', 'en', '2020', { styles: ['fullart'], artist: 'X' }), print('b', 'en', '2021', { styles: ['fullart'], artist: 'Y' })]],
      ['B', [print('c', 'fr', '2020', { styles: ['borderless', 'fullart'], artist: 'X' })]],
    ])
    expect(themeCoverage(byName)).toEqual({
      styles: [{ style: 'fullart', cards: 2 }, { style: 'borderless', cards: 1 }],
      artists: [{ artist: 'X', cards: 2 }],
    })
  })

  it('reads an older database as regular frames', () => {
    expect(buildPrintsQuery('Sol Ring', 'fr', false, false).sql).toContain('0 AS style')
    expect(buildPrintsQuery('Sol Ring', 'fr').sql).toContain('p.style')
  })
})

const DB = '.data/cards-mtg.db'
const withDb = existsSync(DB) ? describe : describe.skip

withDb('themes against the real card database', () => {
  const db = openCardDb()
  afterAll(() => db.close())

  it('knows full-art and old-frame basics, and their artists', async () => {
    const prints = await listPrints(db, 'Mountain', 'en')
    expect(prints.some(p => p.styles.includes('fullart'))).toBe(true)
    expect(prints.some(p => p.styles.includes('oldframe'))).toBe(true)
    expect(prints.filter(p => p.artist).length).toBeGreaterThan(prints.length * 0.9)
  })
})
