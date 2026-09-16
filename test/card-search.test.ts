import type { QueryContext, SearchFilters } from '../app/composables/useCardSearch'
import { describe, expect, it } from 'vitest'
import { browseParams, emptyFilters, isRawSyntax } from '../app/composables/useCardSearch'
import { parseBrowseQuery } from '../server/utils/cards/browse-params'

function ctx(identity: QueryContext['identity'], lang: QueryContext['lang'] = 'fr'): QueryContext {
  return { identity, lang }
}

describe('isRawSyntax', () => {
  it('recognises Scryfall operators', () => {
    for (const q of ['t:instant', 'cmc<=2', 'o:"draw a card"', 'id>=wu', 'pow=3'])
      expect(isRawSyntax(q), q).toBe(true)
  })

  it('leaves names and plain words alone', () => {
    for (const q of ['sol ring', 'Atraxa, Praetors\' Voice', 'draw', ''])
      expect(isRawSyntax(q), q).toBe(false)
  })
})

// The client encodes, the server decodes: these two halves of one contract
// must agree exactly, or a filter silently changes meaning in transit.
describe('browseParams ↔ parseBrowseQuery', () => {
  it('round-trips every filter', () => {
    const filters: SearchFilters = {
      ...emptyFilters(),
      text: 'angel',
      themes: ['draw', 'flying'],
      type: 'creature',
      subtype: 'Angel',
      colors: ['W', 'U'],
      maxCmc: 4,
      maxPrice: 2.5,
      order: 'eur',
      commanderOnly: true,
    }
    const p = parseBrowseQuery(browseParams(filters, ctx(['W', 'U', 'B', 'G']), 3))
    expect(p.filters).toEqual({
      text: 'angel',
      themes: ['draw', 'flying'],
      type: 'creature',
      subtype: 'Angel',
      colors: ['W', 'U'],
      maxCmc: 4,
      maxPrice: 2.5,
      commanderOnly: true,
    })
    expect(p.ctx).toEqual({ identity: ['W', 'U', 'B', 'G'], lang: 'fr' })
    expect(p.order).toBe('eur')
    expect(p.page).toBe(3)
  })

  it('keeps "no constraint" and "colourless" distinct across the wire', () => {
    expect(parseBrowseQuery(browseParams(emptyFilters(), ctx(null), 1)).ctx.identity).toBeNull()
    expect(parseBrowseQuery(browseParams(emptyFilters(), ctx([]), 1)).ctx.identity).toEqual([])
  })

  it('omits unset filters, so identical searches share one URL', () => {
    expect(browseParams(emptyFilters(), ctx(null, 'en'), 1)).toEqual({ lang: 'en', order: 'edhrec', page: '1' })
  })

  it('treats zero as a real bound, not as "unset"', () => {
    const p = parseBrowseQuery(browseParams({ ...emptyFilters(), maxCmc: 0, maxPrice: 0 }, ctx(null), 1))
    expect(p.filters.maxCmc).toBe(0)
    expect(p.filters.maxPrice).toBe(0)
  })
})
