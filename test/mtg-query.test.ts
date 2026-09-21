import { existsSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import {
  buildAutocompleteQuery,
  buildCardQuery,
  buildPinnedQuery,
  buildPrintsQuery,
  maskOf,
} from '../server/utils/cards/mtg-query'
import { fold } from '../server/utils/cards/text'
import { openCardDb } from './support/card-db'
import { itPerf } from './support/perf'

const DB = '.data/cards-mtg.db'
const hasDb = existsSync(DB)
// Integration tests need a built database. `npm run cards:ingest` produces it;
// without it these skip rather than fail, so a fresh clone still runs green.
const withDb = hasDb ? describe : describe.skip

describe('colour masks', () => {
  it('maps WUBRG to distinct bits', () => {
    expect(maskOf(['W'])).toBe(1)
    expect(maskOf(['G'])).toBe(16)
    expect(maskOf(['W', 'U', 'B', 'R', 'G'])).toBe(31)
    expect(maskOf([])).toBe(0)
  })

  it('expresses identity subset and colour superset as integer tests', () => {
    const wubg = maskOf(['W', 'U', 'B', 'G'])
    const azorius = maskOf(['W', 'U'])
    const rakdos = maskOf(['B', 'R'])
    // `id<=WUBG`: the card fits inside the commander's identity.
    expect(azorius & ~wubg).toBe(0)
    expect(rakdos & ~wubg).not.toBe(0) // red is outside
    // `color>=U`: the card is at least blue.
    expect(azorius & maskOf(['U'])).toBe(maskOf(['U']))
  })
})

describe('fold', () => {
  it('strips accents and case so French names match', () => {
    expect(fold('Éclaireur')).toBe('eclaireur')
    expect(fold('Atraxa, Voix des Prætors ')).toBe('atraxa, voix des prætors')
    expect(fold('')).toBe('')
  })
})

describe('query shape', () => {
  it('binds WHERE args before paging and language', () => {
    const q = buildCardQuery({ maxCmc: 3 }, { identity: ['W'], lang: 'fr' }, 'edhrec', 2)
    // identity mask, cmc, then LIMIT, OFFSET, lang — order matters, a mismatch
    // silently returns the wrong rows instead of erroring.
    expect(q.args).toEqual([1, 3, 175, 175, 'fr'])
  })

  it('pages oracle_cards before joining printings', () => {
    const { sql } = buildCardQuery({}, { identity: null, lang: 'en' })
    // The CTE is what stops SQLite driving from best_printings (SCAN bp).
    expect(sql).toMatch(/WITH page AS/)
    expect(sql.indexOf('LIMIT')).toBeLessThan(sql.indexOf('JOIN best_printings'))
  })

  it('sorts on sentinel columns, never on a nullable one', () => {
    // An `IS NULL` guard at the head of ORDER BY defeats every index; this is
    // the regression that held the default browse at 66 ms.
    const { sql } = buildCardQuery({}, { identity: null, lang: 'en' }, 'edhrec')
    expect(sql).toContain('edhrec_sort')
    expect(sql).not.toMatch(/ORDER BY[^)]*IS NULL/)
  })

  it('treats a null identity as "no filter" but an empty one as colourless', () => {
    expect(buildCardQuery({}, { identity: null, lang: 'en' }).sql).not.toContain('identity_mask')
    expect(buildCardQuery({}, { identity: [], lang: 'en' }).sql).toContain('identity_mask')
  })

  it('filters budget on the cheapest printing, not the displayed one', () => {
    const { sql } = buildCardQuery({ maxPrice: 5 }, { identity: null, lang: 'fr' })
    expect(sql).toContain('min_price_eur')
    expect(sql).not.toContain('p.price_eur <=')
  })
})

withDb('against the real card database', () => {
  const db = openCardDb()
  const rows = async (q: { sql: string, args: unknown[] }) => (await db.execute(q)).rows
  afterAll(() => db.close())

  it('matches Scryfall on Commander legality', async () => {
    const r = await rows({ sql: `SELECT COUNT(*) AS n FROM oracle_cards WHERE legal_commander = 1`, args: [] })
    // Scryfall reports 31 830 for `legal:commander unique=cards`. An exact match
    // means our derivation from the bulk `legalities` object is sound.
    expect(Number(r[0]!.n)).toBe(31830)
  })

  it('returns the most-played cards first, localised', async () => {
    const r = await rows(buildCardQuery({}, { identity: ['W', 'U', 'B', 'G'], lang: 'fr' }, 'edhrec', 1))
    expect(r.length).toBe(175)
    expect(r[0]!.name).toBe('Sol Ring')
    expect(r[0]!.printed_name).toBe('Anneau solaire')
    // Ranks must be non-decreasing: unranked cards sit at the end, not the top.
    const ranks = r.map(x => Number(x.edhrec_sort))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('prefers a French printing and falls back to English', async () => {
    const r = await rows(buildCardQuery({}, { identity: null, lang: 'fr' }, 'edhrec', 1))
    const french = r.filter(x => x.lang === 'fr').length
    // Not every card has a French printing; the fallback must be the exception.
    expect(french).toBeGreaterThan(r.length * 0.9)
  })

  it('resolves a pinned printing exactly', async () => {
    const r = await rows(buildPinnedQuery('m21', '177', 'fr'))
    expect(r[0]!.name).toBe('Cultivate')
    expect(r[0]!.printed_name).toBe('Culture')
  })

  it('autocompletes accent-insensitively', async () => {
    const r = await rows(buildAutocompleteQuery('sol r'))
    expect(r.map(x => x.name)).toContain('Sol Ring')
  })

  it('autocompletes later words too, after name starts — like Scryfall', async () => {
    // Checked against the live API: "praetor" offers "Praetor's Grasp" and then
    // "Ebon Praetor". A prefix-only version would silently lose the latter.
    const names = (await rows(buildAutocompleteQuery('praetor'))).map(x => String(x.name))
    expect(names).toContain('Ebon Praetor')
    const startsWith = names.map(n => n.toLowerCase().startsWith('praetor'))
    expect(startsWith.lastIndexOf(true)).toBeLessThan(startsWith.indexOf(false))
  })

  it('lists the printings of the playable card only, never its art series', async () => {
    // "Sol Ring // Sol Ring" (art series) shares the front face name. Pinning one
    // of its printings would swap the deck's card for an unplayable art card.
    async function layoutsOf(name: string) {
      const ids = (await rows(buildPrintsQuery(name, 'en'))).map(r => String(r.id))
      expect(ids.length, name).toBeGreaterThan(0)
      const { rows: found } = await db.execute({
        sql: `SELECT DISTINCT o.layout FROM printings p
                JOIN oracle_cards o ON o.oracle_id = p.oracle_id
               WHERE p.id IN (${ids.map(() => '?').join(',')})`,
        args: ids,
      })
      return found.map(x => String(x.layout))
    }
    expect(await layoutsOf('Sol Ring')).toEqual(['normal'])
    // Found by its front face, and still not its art series.
    expect(await layoutsOf('Delver of Secrets')).toEqual(['transform'])
  })

  it('finds cards by French printed text', async () => {
    const r = await rows(buildCardQuery({ text: 'contresort' }, { identity: null, lang: 'fr' }))
    expect(r.length).toBeGreaterThan(0)
  })

  it('ignores reminder text, like Scryfall\'s oracle: search', async () => {
    // Cycling's reminder reads "Discard this card: Draw a card." Indexing it
    // made the draw theme match every cycling land — 582 false hits.
    const steppe = await rows(buildCardQuery({ themes: ['draw'], text: 'secluded steppe' }, { identity: null, lang: 'en' }))
    expect(steppe).toHaveLength(0)
    // A card whose rules text really does draw still matches.
    const opt = await rows(buildCardQuery({ themes: ['draw'], text: 'opt' }, { identity: null, lang: 'en' }))
    expect(opt.map(x => x.name)).toContain('Opt')
  })

  itPerf('keeps the default browse fast', async () => {
    const q = buildCardQuery({}, { identity: ['W', 'U', 'B', 'G'], lang: 'fr' }, 'edhrec', 1)
    await rows(q) // warm the page cache
    // The best of three: one stalled run must not fail the suite.
    let ms = Infinity
    for (let run = 0; run < 3; run++) {
      const t = performance.now()
      await rows(q)
      ms = Math.min(ms, performance.now() - t)
    }
    // This query runs on every keystroke, and it took three fixes to get here:
    // 168 ms from a correlated subquery picking the printing, then 66 ms from a
    // non-indexable ORDER BY, with an 86 ms detour through an index that made
    // things worse. 25 ms leaves headroom without hiding a relapse.
    expect(ms).toBeLessThan(25)
  })

  it('does not sort the whole candidate set', async () => {
    const q = buildCardQuery({}, { identity: ['W', 'U', 'B', 'G'], lang: 'fr' }, 'edhrec', 1)
    const plan = (await db.execute({ sql: `EXPLAIN QUERY PLAN ${q.sql}`, args: q.args })).rows.map(r => String(r.detail))
    // best_printings must never be the driving table, and the inner paging must
    // come from the browse index rather than a scan.
    expect(plan.some(d => d.includes('SCAN bp'))).toBe(false)
    expect(plan.some(d => d.includes('idx_oracle_browse'))).toBe(true)
  })
})
