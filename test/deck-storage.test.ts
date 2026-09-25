import { describe, expect, it } from 'vitest'
import { isDefaultDeckName, normalizeDeck, readGuestDecks } from '../shared/decks'

const v1Deck = { id: 'd_1', name: 'Atraxa', raw: '1 Sol Ring', createdAt: 1, updatedAt: 2 }

describe('guest deck storage', () => {
  it('migrates a v1 list as Magic, keeping ids', () => {
    const r = readGuestDecks(JSON.stringify([v1Deck]), null)
    expect(r).toEqual({ migrate: true, decks: [{ ...v1Deck, game: 'mtg' }] })
  })

  it('prefers v2, and still asks for v1 to be deleted', () => {
    const v2 = [{ ...v1Deck, id: 'd_2', game: 'optcg', raw: '1xOP01-001' }]
    expect(readGuestDecks(JSON.stringify([v1Deck]), JSON.stringify(v2))).toEqual({ migrate: true, decks: v2 })
    expect(readGuestDecks(null, JSON.stringify(v2))).toEqual({ migrate: false, decks: v2 })
  })

  it('is idempotent once migrated', () => {
    const first = readGuestDecks(JSON.stringify([v1Deck]), null)
    const second = readGuestDecks(null, JSON.stringify(first.decks))
    expect(second).toEqual({ migrate: false, decks: first.decks })
  })

  it('survives corrupt or empty storage', () => {
    expect(readGuestDecks(null, null)).toEqual({ migrate: false, decks: [] })
    expect(readGuestDecks('{not json', null)).toEqual({ migrate: true, decks: [] })
    expect(readGuestDecks(null, '{"a":1}')).toEqual({ migrate: false, decks: [] })
    expect(readGuestDecks(null, JSON.stringify([null, 3, { name: 'no id' }, v1Deck]))).toEqual({
      migrate: false,
      decks: [{ ...v1Deck, game: 'mtg' }],
    })
  })

  it('normalises server rows: ISO dates, unknown game, share fields', () => {
    expect(normalizeDeck({ id: 'd', name: 'x', game: 'chess', raw: null, createdAt: '2026-09-16T00:00:00.000Z', updatedAt: 5, shareId: null, public: 1 }))
      .toEqual({ id: 'd', name: 'x', game: 'mtg', raw: '', createdAt: Date.parse('2026-09-16T00:00:00.000Z'), updatedAt: 5, shareId: null, public: true })
  })
})

describe('isDefaultDeckName', () => {
  it('knows the placeholder in both languages, and an empty name', () => {
    expect(isDefaultDeckName('Nouveau deck')).toBe(true)
    expect(isDefaultDeckName(' new deck ')).toBe(true)
    expect(isDefaultDeckName('')).toBe(true)
    expect(isDefaultDeckName(undefined)).toBe(true)
  })
  it('leaves a name of its own alone', () => {
    expect(isDefaultDeckName('Krenko le caïd')).toBe(false)
    expect(isDefaultDeckName('Nouveau deck gobelins')).toBe(false)
  })
})
