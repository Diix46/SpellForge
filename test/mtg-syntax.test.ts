import type { SyntaxErrorCode } from '../server/utils/cards/mtg-syntax'
import { existsSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { buildCardQuery, buildCoachSearchQuery } from '../server/utils/cards/mtg-query'
import { compileSyntax, isSyntaxQuery, QuerySyntaxError } from '../server/utils/cards/mtg-syntax'
import { openCardDb } from './support/card-db'

function refusal(text: string): { code: SyntaxErrorCode, term: string } | null {
  try {
    compileSyntax(text)
    return null
  }
  catch (err) {
    if (err instanceof QuerySyntaxError)
      return { code: err.code, term: err.term }
    throw err
  }
}

describe('isSyntaxQuery', () => {
  it('recognises Scryfall keywords', () => {
    for (const q of ['t:instant', '-t:land', 'cmc<=2', 'o:"draw a card"', 'id>=wu', 'pow=3', 'lightning usd<2', '!"Sol Ring"', '(t:elf or t:goblin)'])
      expect(isSyntaxQuery(q), q).toBe(true)
  })

  it('leaves names alone, even with a colon', () => {
    for (const q of ['sol ring', 'Atraxa, Praetors\' Voice', 'draw', '', 'Circle of Protection: Red', 'Summon: Bahamut'])
      expect(isSyntaxQuery(q), q).toBe(false)
  })
})

describe('compileSyntax', () => {
  it('binds values in the order the placeholders appear', () => {
    const { where, args } = compileSyntax('t:elf cmc<=2 o:"draw a card"')
    expect(where).toBe(`(o.type_line LIKE ? ESCAPE '\\' AND o.cmc <= ? AND o.rules_text LIKE ? ESCAPE '\\')`)
    expect(args).toEqual(['%elf%', 2, '%draw a card%'])
  })

  it('gives "and" precedence over "or"', () => {
    const { where } = compileSyntax('t:elf or t:goblin c:g')
    expect(where).toMatch(/^\(o\.type_line LIKE .* OR \(o\.type_line LIKE .* AND .*\)\)$/)
  })

  it('negates without letting NULL swallow the card', () => {
    expect(compileSyntax('-t:land').where).toBe(`NOT COALESCE(o.type_line LIKE ? ESCAPE '\\', 0)`)
  })

  it('reads colour ":" as "at least" and identity ":" as "within"', () => {
    expect(compileSyntax('c:wu').where).toBe('(o.colors_mask & 3) = 3')
    expect(compileSyntax('id:wu').where).toBe('(o.identity_mask & ~3) = 0')
    // "c" is colourless, not "a superset of nothing" — which would be every card.
    expect(compileSyntax('c:c').where).toBe('o.colors_mask = 0')
    expect(compileSyntax('id:azorius').where).toBe(compileSyntax('id:wu').where)
  })

  it('treats a number in a mana cost as a minimum of generic mana', () => {
    const { where, args } = compileSyntax('m:2WW')
    expect(where).toContain('COALESCE(generic, 0) >= ?')
    expect(args).toEqual([2, '{W}', 6])
    // {0} is only ever a literal zero cost, never "at least nothing".
    expect(compileSyntax('m:0').args).toEqual(['{0}', 3])
  })

  it('negates a whole group', () => {
    expect(compileSyntax('-(t:elf or t:goblin)').where).toMatch(/^NOT COALESCE\(\(o\.type_line LIKE .* OR o\.type_line LIKE .*\), 0\)$/)
  })

  it('reads a stat against cmc through an indexed, correlated probe', () => {
    for (const q of ['cmc>pow', 'pow>cmc', 'loy<=mv'])
      expect(compileSyntax(q).where, q).toMatch(/^EXISTS \(SELECT 1 FROM oracle_faces f WHERE f\.oracle_id = o\.oracle_id AND /)
  })

  it('checks paper availability on the printing', () => {
    expect(compileSyntax('game:paper').where).toContain('p.is_paper = 1')
    expect(refusal('game:arena')).toEqual({ code: 'badValue', term: 'game:arena' })
  })

  it('drops bare words with nothing to search for', () => {
    expect(compileSyntax('t:elf .').where).toBe(compileSyntax('t:elf').where)
    expect(compileSyntax('t:instant fire // ice').args).toHaveLength(3)
  })

  it('checks every printing term on the same printing', () => {
    const { where, args } = compileSyntax('t:creature r:rare s:m21')
    expect(where).toBe(`(o.type_line LIKE ? ESCAPE '\\' AND o.oracle_id IN (SELECT p.oracle_id FROM printings p WHERE p.lang = 'en' AND p.rarity IN ('rare') AND p.set_code = ?))`)
    expect(args).toEqual(['%creature%', 'm21'])
  })

  it('lets a set drive a group mixing card and printing terms, and correlates otherwise', () => {
    expect(compileSyntax('s:m21 (r:rare or t:elf)').where).toMatch(/^o\.oracle_id IN \(SELECT p\.oracle_id FROM printings p JOIN oracle_cards o ON/)
    expect(compileSyntax('year<=2000 (r:rare or t:elf)').where).toMatch(/^EXISTS \(SELECT 1 FROM printings p WHERE p\.oracle_id = o\.oracle_id/)
  })

  it('reads power per face, and compares two stats on one face', () => {
    expect(compileSyntax('pow>=3').where).toBe('o.oracle_id IN (SELECT oracle_id FROM oracle_faces WHERE power IS NOT NULL AND CAST(power AS REAL) >= ?)')
    expect(compileSyntax('pow>tou').where).toBe('o.oracle_id IN (SELECT oracle_id FROM oracle_faces WHERE power IS NOT NULL AND toughness IS NOT NULL AND CAST(power AS REAL) > CAST(toughness AS REAL))')
  })

  it('searches self-references only when the value uses ~', () => {
    expect(compileSyntax('o:"~ deals"').where).toContain('o.self_text')
    expect(compileSyntax('o:"shock deals"').where).toContain('o.rules_text')
  })

  it('ignores display options without turning an "or" into "everything"', () => {
    const plain = compileSyntax('t:elf')
    const withOrder = compileSyntax('t:elf or order:name')
    expect(withOrder.where).toBe(plain.where)
    expect(withOrder.order).toBe('name')
    expect(compileSyntax('unique:prints lang:fr').where).toBe('1')
  })

  it('does not filter on a value still being typed', () => {
    expect(compileSyntax('t:').where).toBe('1')
    expect(compileSyntax('t:elf c:').where).toBe(compileSyntax('t:elf').where)
  })

  it('never puts typed text into the SQL', () => {
    const { where, args } = compileSyntax('o:"\'); DROP TABLE printings; --" a:"x%_"')
    expect(where).not.toContain('DROP')
    expect(args).toContain('%\'); DROP TABLE printings; --%')
    // LIKE wildcards typed by the user are matched literally.
    expect(args).toContain('%x\\%\\_%')
  })

  it('refuses what it cannot honour, naming the term', () => {
    const cases: [string, SyntaxErrorCode, string][] = [
      ['t:elf usd<5', 'unsupportedKeyword', 'usd<5'],
      ['foo:bar', 'unknownKeyword', 'foo:bar'],
      ['c:purple', 'badValue', 'c:purple'],
      ['cmc>=two', 'badValue', 'cmc>=two'],
      ['f:hearthstone', 'badValue', 'f:hearthstone'],
      ['o:/draw/', 'badValue', 'o:/draw/'],
      ['t>3', 'badOperator', 't>3'],
      ['t:elf)', 'unbalanced', ')'],
      ['is:shiny', 'badValue', 'is:shiny'],
      ['t:elf order:usd', 'badValue', 'order:usd'],
    ]
    for (const [q, code, term] of cases)
      expect(refusal(q), q).toEqual({ code, term })
  })

  it('never reads Object.prototype as a keyword table', () => {
    // Each of these reached the SQL as "[object Object]" or crashed with a TypeError.
    const cases: [string, SyntaxErrorCode][] = [
      ['is:constructor', 'badValue'],
      ['not:__proto__', 'badValue'],
      ['constructor:x', 'unknownKeyword'],
      ['c:constructor', 'badValue'],
      ['cmc:constructor', 'badValue'],
      ['r:constructor', 'badValue'],
      ['f:constructor', 'badValue'],
      ['order:constructor', 'badValue'],
    ]
    for (const [q, code] of cases)
      expect(refusal(q)?.code, q).toBe(code)
  })

  it('bounds the size of the generated SQL', () => {
    expect(refusal(Array.from({ length: 41 }, (_, i) => `t:x${i}`).join(' '))?.code).toBe('tooComplex')
    expect(refusal(`${'('.repeat(13)}t:elf`)?.code).toBe('tooComplex')
    // 250 negations overflowed SQLite's parser: a 500 instead of a message.
    expect(refusal(`t:creature ${'-'.repeat(250)}t:elf`)?.code).toBe('tooComplex')
    // An unclosed group is read to the end, as Scryfall does.
    expect(refusal('(t:elf or t:goblin')).toBeNull()
  })
})

const DB = '.data/cards-mtg.db'
const withDb = existsSync(DB) ? describe : describe.skip

withDb('query syntax against the real card database', () => {
  const db = openCardDb()
  afterAll(() => db.close())

  async function names(text: string, identity: ('W' | 'U' | 'B' | 'R' | 'G')[] | null = null) {
    const q = buildCardQuery({ text }, { identity, lang: 'en' })
    const [page, count] = await Promise.all([
      db.execute({ sql: q.sql, args: q.args }),
      db.execute({ sql: q.countSql, args: q.countArgs }),
    ])
    return { names: page.rows.map(r => String(r.name)), total: Number(count.rows[0]!.total) }
  }

  it('still applies the commander identity to a syntax query', async () => {
    const { rows } = await db.execute((() => {
      const q = buildCardQuery({ text: 't:instant cmc<=2' }, { identity: ['U'], lang: 'en' })
      return { sql: q.sql, args: q.args }
    })())
    expect(rows.length).toBeGreaterThan(50)
    for (const r of rows) {
      expect(String(r.type_line)).toMatch(/Instant/)
      expect(Number(r.cmc)).toBeLessThanOrEqual(2)
      expect(Number(r.identity_mask) & ~2).toBe(0)
    }
  })

  it('finds a card by its back face and by ~', async () => {
    expect((await names('!"Delver of Secrets" o:flying pow>=3')).names).toEqual(['Delver of Secrets // Insectile Aberration'])
    expect((await names('o:"~ deals 2 damage to any target"')).names).toContain('Shock')
    // A legend's short name counts as ~ too: "Chandra deals 2 damage…".
    expect((await names('o:"~ deals 2 damage" t:planeswalker')).names).toContain('Chandra, Torch of Defiance')
  })

  it('gives the same cards whichever subquery shape is picked', async () => {
    // Set-driven join (inner `o` shadows the outer one) vs correlated EXISTS:
    // the top-level "or" forces the second shape on the same question.
    const joined = await names('s:m21 (r:rare or t:elf)')
    const correlated = await names('(s:m21 r:rare) or (s:m21 t:elf)')
    expect(joined.total).toBeGreaterThan(0)
    expect(joined.names.sort()).toEqual(correlated.names.sort())
  })

  it('negates a group into its exact complement', async () => {
    const [all, inGroup, outOfGroup] = await Promise.all([
      names('t:creature'),
      names('(t:elf or t:goblin) t:creature'),
      names('-(t:elf or t:goblin) t:creature'),
    ])
    expect(inGroup.total).toBeGreaterThan(0)
    expect(inGroup.total + outOfGroup.total).toBe(all.total)
  })

  it('finds generic mana wherever the cost writes it, and a literal {0}', async () => {
    // {X}{2}{U}: the generic 2 is not the first symbol.
    expect((await names('!"Stroke of Genius" m:2U')).names).toEqual(['Stroke of Genius'])
    expect((await names('m:0 t:artifact')).names).toContain('Ornithopter')
  })

  it('tests costs and text face by face', async () => {
    // "{1}{G} // {G}" is two faces with one {G} each, not a card costing {G}{G}.
    expect((await names('!"Studious First-Year" m:{G}{G}')).names).toEqual([])
    // An adventure's creature half has no rules text of its own.
    expect((await names('!"Curious Pair" is:vanilla')).names).toEqual(['Curious Pair // Treats to Share'])
  })

  it('keeps printing terms on one printing', async () => {
    // Opt was never rare in M21, though it is rare elsewhere and printed in M21.
    const { names: rare } = await names('r>=rare s:m21')
    expect(rare).not.toContain('Opt')
    expect((await names('s:m21 !"Opt"')).names).toEqual(['Opt'])
    // "Printed outside M21" — Cultivate is, so it stays.
    expect((await names('!"Cultivate" -s:m21')).names).toEqual(['Cultivate'])
  })

  it('does not hide a card for a memorabilia reprint', async () => {
    // Demonic Tutor has a Collectors' Edition printing; it used to hide the card.
    expect((await names('is:gamechanger')).names).toContain('Demonic Tutor')
  })

  it('sorts by an order: typed in the query', async () => {
    const { names: sorted } = await names('t:dragon order:name')
    expect(sorted.slice(0, 20)).toEqual([...sorted.slice(0, 20)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })))
  })

  it('answers the coach with its own shape', async () => {
    const q = buildCoachSearchQuery('id<=wubg t:instant cmc<=2 o:"draw a card"')
    const { rows } = await db.execute({ sql: q.sql, args: q.args })
    expect(rows.length).toBe(20)
    expect(rows.every(r => typeof r.oracle_all === 'string' && /draw a card/i.test(r.oracle_all))).toBe(true)
  })

  it('stays fast on printing and face lookups', async () => {
    // The local client is synchronous: a slow query stalls every user. The
    // stat-against-cmc cases took 65 to 181 s before their index.
    const worst = Array.from({ length: 40 }, (_, i) => `-o:"zz${i}"`).join(' ')
    for (const text of ['r>=rare s:m21', 'pow>tou t:creature', 'id=wubrg', '!"Sol Ring"', 'cmc>pow', 'pow>cmc t:creature', 'loy>cmc', 's:m21 (r:rare or t:elf)', worst]) {
      const q = buildCardQuery({ text }, { identity: null, lang: 'en' })
      await db.execute({ sql: q.countSql, args: q.countArgs }) // warm up
      const t = performance.now()
      await db.execute({ sql: q.sql, args: q.args })
      await db.execute({ sql: q.countSql, args: q.countArgs })
      // Page + count measured at 2–20 ms once the planner has statistics
      // (ANALYZE at ingest), ~75 ms for cmc>pow, whose count must probe every
      // card. The bound is there to catch the pathological, not to budget.
      expect(performance.now() - t, text).toBeLessThan(150)
    }
  })
})
