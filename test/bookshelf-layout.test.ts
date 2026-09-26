import type { SetProgress } from '../shared/collection'
import { describe, expect, it } from 'vitest'
import { findBinder, hueOf, layoutLibrary } from '../app/utils/bookshelf/layout'

const set = (code: string, type = 'expansion'): SetProgress => ({ code, name: code, icon: null, art: null, releasedAt: null, type, total: 10, owned: 1 })
const opts = {
  perShelf: 3,
  rowsPerCase: 2,
  kindOf: (s: SetProgress) => (s.type === 'commander' ? 'commander' : 'main'),
  kinds: ['main', 'commander'] as const,
  labelOf: (k: string) => k.toUpperCase(),
  freshLabel: 'NEW',
}

describe('the library layout', () => {
  it('puts the new releases first, then each family on its own shelves', () => {
    const cases = layoutLibrary(
      [set('a'), set('c1', 'commander'), set('b'), set('d'), set('e'), set('c2', 'commander')],
      [set('n1'), set('n2'), set('n3'), set('n4')],
      opts,
    )
    const rows = cases.flatMap(c => c.rows)
    expect(rows.map(r => [r.label, r.binders.map(b => b.set.code)])).toEqual([
      ['NEW', ['n1', 'n2', 'n3']],
      ['MAIN', ['a', 'b', 'd']],
      ['MAIN', ['e']],
      ['COMMANDER', ['c1', 'c2']],
    ])
    expect(rows[0]!.binders.every(b => b.fresh)).toBe(true)
    expect(cases.map(c => c.rows.length)).toEqual([2, 2])
  })

  it('finds a binder on its shelf', () => {
    const cases = layoutLibrary([set('a'), set('b'), set('c'), set('d')], [], opts)
    expect(findBinder(cases, 'd')).toEqual({ caseIndex: 0, rowIndex: 1, slot: 0 })
    expect(findBinder(cases, 'zz')).toBeNull()
  })

  it('is empty with nothing to shelve, and gives each set a stable hue', () => {
    expect(layoutLibrary([], [], opts)).toEqual([])
    expect(hueOf('blb')).toBe(hueOf('blb'))
    expect(hueOf('blb')).toBeGreaterThanOrEqual(0)
    expect(hueOf('blb')).toBeLessThan(360)
  })
})
