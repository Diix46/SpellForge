import type { Client, InValue } from '@libsql/client'
import type { OptcgCard } from '../shared/optcg/types'
import { existsSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseOptcgBrowseQuery } from '../server/utils/cards/optcg-params'
import { buildOptcgAutocompleteQuery, buildOptcgBrowseQuery, buildOptcgPrintsQuery, colorMask } from '../server/utils/cards/optcg-query'
import { resolveOptcgEntries } from '../server/utils/cards/optcg-resolve'
import { toOptcgCard } from '../server/utils/cards/optcg-shape'
import { MIN_LEGAL_BLOCK } from '../shared/optcg/rules'

describe('one Piece browse parameters', () => {
  it('keeps only known values', () => {
    const p = parseOptcgBrowseQuery({
      text: 'zoro',
      category: 'Leader',
      colors: 'Red,Pink,Green',
      costMax: '4',
      costMin: '-1',
      set: 'op-01',
      legal: '1',
      order: 'cost',
      page: '3',
      lang: 'fr',
    })
    expect(p.filters).toMatchObject({ text: 'zoro', category: 'Leader', colors: ['Red', 'Green'], costMax: 4, costMin: null, set: 'OP-01', legalOnly: true })
    expect(p).toMatchObject({ lang: 'fr', order: 'cost', page: 3 })
    expect(parseOptcgBrowseQuery({ category: 'Don', order: 'rarity', set: 'x;drop' })).toMatchObject({
      filters: { category: '', set: '' },
      order: 'number',
      lang: 'en',
    })
  })

  it('tells "no leader yet" from a leader', () => {
    expect(parseOptcgBrowseQuery({}).filters.leaderColors).toBeNull()
    expect(parseOptcgBrowseQuery({ leader: 'Red,Blue' }).filters.leaderColors).toEqual(['Red', 'Blue'])
  })

  it('binds the language before the filters', () => {
    const q = buildOptcgBrowseQuery({ category: 'Character', costMax: 3 }, 'fr', 'number', 2)
    expect(q.args).toEqual(['fr', 'Character', 3, 120, 120])
    expect(q.countArgs).toEqual(['Character', 3])
    expect(colorMask(['Red', 'Yellow'])).toBe(33)
  })
})

const DB = '.data/cards-optcg.db'
const withDb = existsSync(DB) ? describe : describe.skip

withDb('One Piece queries against the real card database', () => {
  let db: Client
  beforeAll(() => {
    db = createClient({ url: `file:${DB}` })
  })
  afterAll(() => db?.close())

  async function browse(filters: Parameters<typeof buildOptcgBrowseQuery>[0], lang = 'fr', order: Parameters<typeof buildOptcgBrowseQuery>[2] = 'number') {
    const q = buildOptcgBrowseQuery(filters, lang, order)
    const [page, count] = await Promise.all([
      db.execute({ sql: q.sql, args: q.args }),
      db.execute({ sql: q.countSql, args: q.countArgs as InValue[] }),
    ])
    return { cards: page.rows.map(toOptcgCard), total: Number(count.rows[0]!.total) }
  }

  it('lists one entry per card number, in French where Bandai has it', async () => {
    const { cards, total } = await browse({})
    expect(total).toBeGreaterThan(2500)
    expect(cards).toHaveLength(120)
    expect(new Set(cards.map(c => c.number)).size).toBe(120)
    const zoro = (await browse({ text: 'OP01-001' })).cards[0]!
    expect(zoro).toMatchObject({ number: 'OP01-001', category: 'Leader', colors: ['Red'], life: 5, power: 5000 })
    expect(zoro.image).toMatch(/^\/api\/images\/optcg\/(fr|en)\/OP01-001/)
  })

  it('searches names, rules text and crews in either language', async () => {
    expect((await browse({ text: 'zoro', category: 'Leader' })).cards.map(c => c.number)).toContain('OP01-001')
    // A crew typed in French finds the English-only cards too: search spans both.
    const crew = await browse({ text: 'chapeau de paille' })
    expect(crew.total).toBeGreaterThan(50)
    expect((await browse({ text: 'OP01-01' })).cards.every(c => c.number.startsWith('OP01-01'))).toBe(true)
  })

  it('builds under a leader: no leaders, every colour within the leader\'s', async () => {
    const { cards, total } = await browse({ leaderColors: ['Red', 'Green'] })
    expect(total).toBeGreaterThan(300)
    for (const c of cards) {
      expect(c.category).not.toBe('Leader')
      expect(c.colors.every(x => x === 'Red' || x === 'Green')).toBe(true)
    }
  })

  it('keeps the standard format to legal cards', async () => {
    const all = await browse({})
    const legal = await browse({ legalOnly: true })
    expect(legal.total).toBeLessThan(all.total)
    for (const c of legal.cards) {
      expect(c.banned).toBe(false)
      expect(c.block === null || c.block >= MIN_LEGAL_BLOCK).toBe(true)
    }
  })

  it('sorts by cost with cost-less leaders last', async () => {
    const { cards } = await browse({ category: 'Character' }, 'en', 'cost')
    const costs = cards.map(c => c.cost ?? Infinity)
    expect(costs).toEqual([...costs].sort((a, b) => a - b))
  })

  it('resolves numbers and pinned arts in input order', async () => {
    const cards = await resolveOptcgEntries(db, [
      { number: 'OP01-016', id: 'OP01-016_p1' },
      { number: 'OP99-999' },
      // An art of another card falls back to the number's usual art.
      { number: 'OP01-016', id: 'OP01-001_p1' },
      { number: 'EB01-006' },
    ], 'fr')
    expect(cards.map(c => c?.id ?? null)).toEqual(['OP01-016_p1', null, expect.stringMatching(/^OP01-016/), expect.stringMatching(/^EB01-006/)])
    expect((cards[0] as OptcgCard).lang).toBe('fr')
  })

  it('counts reprints under their base number', async () => {
    const { rows } = await db.execute(`SELECT COUNT(*) AS n FROM op_numbers WHERE card_number LIKE '%\\_%' ESCAPE '\\'`)
    expect(Number(rows[0]!.n)).toBe(0)
  })

  it('suggests cards, names first, then numbers', async () => {
    const byName = (await db.execute(buildOptcgAutocompleteQuery('nami', 'fr'))).rows.map(toOptcgCard)
    expect(byName.length).toBeGreaterThan(0)
    expect(byName[0]!.name.toLowerCase()).toMatch(/^nami/)
    const byNumber = (await db.execute(buildOptcgAutocompleteQuery('OP01-00', 'fr'))).rows.map(toOptcgCard)
    expect(byNumber.map(c => c.number)).toContain('OP01-001')
  })

  it('lists every art of a card, the base art first', async () => {
    const { rows } = await db.execute(buildOptcgPrintsQuery('OP01-016', 'fr'))
    const ids = rows.map(r => String(r.id))
    expect(ids[0]).toBe('OP01-016')
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThan(3)
  })
})
