import { existsSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import {
  backImage,
  findMatch,
  frontImage,
  getImageUris,
  hasRealImage,
  isDoubleFaced,
} from '../app/composables/scryfall/helpers'
import { displayName, englishTypeLine } from '../app/composables/useMtg'
import { buildCardQuery, buildPinnedQuery } from '../server/utils/cards/mtg-query'
import { colorsFromMask, imageUrl, toScryfallShape } from '../server/utils/cards/mtg-shape'
import { openCardDb } from './support/card-db'

const DB = '.data/cards-mtg.db'
const withDb = existsSync(DB) ? describe : describe.skip

describe('colorsFromMask', () => {
  it('returns colours in WUBRG order, as Scryfall sends them', () => {
    expect(colorsFromMask(0b10110)).toEqual(['U', 'B', 'G'])
    expect(colorsFromMask(31)).toEqual(['W', 'U', 'B', 'R', 'G'])
  })

  it('treats colourless and missing masks alike', () => {
    expect(colorsFromMask(0)).toEqual([])
    expect(colorsFromMask(null)).toEqual([])
  })
})

describe('imageUrl', () => {
  it('uses the extension Scryfall serves for each size', () => {
    expect(imageUrl('png', 'front', 'abc', null)).toMatch(/\.png$/)
    expect(imageUrl('large', 'front', 'abc', null)).toMatch(/\.jpg$/)
  })

  it('carries the image version so a re-scan changes the URL', () => {
    expect(imageUrl('normal', 'back', 'abc', 1783910776)).toBe('/api/images/mtg/normal/back/abc.jpg?v=1783910776')
  })

  it('asks for the light copy after the version', () => {
    expect(imageUrl('normal', 'front', 'abc', 17, 'thumb')).toBe('/api/images/mtg/normal/front/abc.jpg?v=17&size=thumb')
    expect(imageUrl('normal', 'front', 'abc', null, 'thumb')).toBe('/api/images/mtg/normal/front/abc.jpg?size=thumb')
  })
})

// The point of these tests: the reconstructed shape must work with the app's
// OWN helpers, unchanged. That is what makes the backend swap a drop-in.
withDb('reconstructed cards against the app\'s own helpers', () => {
  const db = openCardDb()
  afterAll(() => db.close())

  async function shaped(q: { sql: string, args: unknown[] }) {
    const { rows } = await db.execute(q)
    return toScryfallShape(db, rows as Record<string, unknown>[])
  }
  async function first(text: string, name: string) {
    const cards = await shaped(buildCardQuery({ text }, { identity: null, lang: 'en' }))
    const card = cards.find(c => String(c.name).startsWith(name))
    expect(card, `${name} should be found`).toBeDefined()
    return card as any
  }

  it('serves a single-faced card with root images and exact fields', async () => {
    const [card] = await shaped(buildCardQuery({}, { identity: ['W', 'U', 'B', 'G'], lang: 'en' }, 'edhrec', 1)) as any[]
    expect(card.name).toBe('Sol Ring')
    expect(englishTypeLine(card)).toBe('Artifact')
    expect(card.color_identity).toEqual([])
    expect(card.legalities.commander).toBe('legal')
    expect(hasRealImage(card)).toBe(true)
    expect(getImageUris(card)?.small).toMatch(/^\/api\/images\/mtg\/small\/front\//)
    expect(isDoubleFaced(card)).toBe(false)
  })

  it('formats prices as two-decimal strings', async () => {
    const [card] = await shaped(buildCardQuery({ maxPrice: 5 }, { identity: null, lang: 'en' }, 'eur')) as any[]
    expect(card.prices.eur).toMatch(/^\d+\.\d{2}$/)
  })

  it('puts a transform card\'s images on its faces, as Scryfall does', async () => {
    const card = await first('delver of secrets', 'Delver of Secrets')
    expect(card.image_uris).toBeUndefined()
    expect(card.card_faces).toHaveLength(2)
    // The app's DFC detection and flip button depend on exactly this shape.
    expect(isDoubleFaced(card)).toBe(true)
    expect(frontImage(card)).toMatch(/\/large\/front\//)
    expect(backImage(card)).toMatch(/\/large\/back\//)
    expect(englishTypeLine(card)).toContain('//')
  })

  it('exposes the token a card creates, for auto-add', async () => {
    const card = await first('krenko mob boss', 'Krenko, Mob Boss')
    const tokens = (card.all_parts ?? []).filter((p: any) => p.component === 'token')
    expect(tokens.length).toBeGreaterThan(0)
  })

  it('localises a pinned French printing through displayName', async () => {
    const [card] = await shaped(buildPinnedQuery('m21', '177', 'fr')) as any[]
    expect(displayName(card, true)).toBe('Culture')
    expect(displayName(card, false)).toBe('Cultivate')
  })

  it('stays matchable by name and by pinned printing', async () => {
    const cards = await shaped(buildCardQuery({}, { identity: null, lang: 'en' }, 'edhrec', 1)) as any[]
    const sol = cards.find(c => c.name === 'Sol Ring')
    expect(findMatch(cards, { quantity: 1, name: 'sol ring' })).toBe(sol)
    expect(findMatch(cards, { quantity: 1, name: 'x', set: sol.set, collectorNumber: sol.collector_number })).toBe(sol)
  })
})
