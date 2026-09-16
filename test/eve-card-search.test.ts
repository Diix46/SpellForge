import { existsSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// The coach's tool module relies on Nitro auto-imports at load time. A pass-
// through cache is all these tests need; the card search itself is uncached.
vi.stubGlobal('defineCachedFunction', (fn: unknown) => fn)

const withDb = existsSync('.data/cards-mtg.db') ? describe : describe.skip

withDb('the coach\'s card search tool', () => {
  let runTool: (name: string, input: unknown) => Promise<unknown>
  beforeAll(async () => {
    ({ runTool } = await import('../server/eve/tools'))
  })

  interface SearchResult {
    count: number
    cards: { name: string, type: string, identity: string[], priceEur: string | null }[]
    error?: string
  }

  it('answers from the local database, in the shape the prompts expect', async () => {
    const res = await runTool('scryfall_search', { query: 'id<=u t:instant cmc<=2' }) as SearchResult
    expect(res.error).toBeUndefined()
    expect(res.count).toBeGreaterThan(res.cards.length)
    expect(res.cards).toHaveLength(20)
    for (const c of res.cards) {
      expect(c.type).toMatch(/Instant/)
      expect(c.identity.every(x => x === 'u')).toBe(true)
    }
    // Most played first, as Scryfall's order=edhrec was.
    expect(res.cards.map(c => c.name)).toContain('Counterspell')
  })

  it('tells the model which part of its query to fix', async () => {
    const res = await runTool('scryfall_search', { query: 't:instant usd<2' }) as SearchResult
    expect(res.error).toBe('Invalid search syntax (unsupportedKeyword): usd<2')
    expect(res.cards).toEqual([])
  })

  it('refuses an empty query rather than answer with the most played cards', async () => {
    const res = await runTool('scryfall_search', { query: '  ' }) as SearchResult
    expect(res.error).toMatch(/^Invalid search syntax/)
    expect(res.cards).toEqual([])
  })

  it('accepts plain words as well as syntax', async () => {
    const res = await runTool('scryfall_search', { query: 'sol ring' }) as SearchResult
    expect(res.cards[0]?.name).toBe('Sol Ring')
  })
})
