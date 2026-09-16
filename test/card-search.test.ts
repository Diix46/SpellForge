import type { QueryContext, SearchFilters } from '../app/composables/useCardSearch'
import { describe, expect, it } from 'vitest'
import { browseParams, emptyFilters, syntaxErrorOf } from '../app/composables/useCardSearch'
import { parseBrowseQuery } from '../server/utils/cards/browse-params'

function ctx(identity: QueryContext['identity'], lang: QueryContext['lang'] = 'fr'): QueryContext {
  return { identity, lang }
}

describe('syntaxErrorOf', () => {
  it('reads the code and term the server sends with a refused query', () => {
    // The shape $fetch throws for an h3 createError({ data }) response.
    const err = Object.assign(new Error('400'), { data: { statusCode: 400, data: { code: 'unsupportedKeyword', term: 'usd<5' } } })
    expect(syntaxErrorOf(err)).toEqual({ code: 'unsupportedKeyword', term: 'usd<5' })
  })

  it('ignores every other failure', () => {
    expect(syntaxErrorOf(new Error('network'))).toBeNull()
    expect(syntaxErrorOf(Object.assign(new Error('500'), { data: { statusCode: 500 } }))).toBeNull()
    expect(syntaxErrorOf(null)).toBeNull()
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

  it('sends query syntax as plain text, for the server to compile', () => {
    const p = browseParams({ ...emptyFilters(), text: 't:instant cmc<=2' }, ctx(['U']), 1)
    expect(p.text).toBe('t:instant cmc<=2')
    expect(parseBrowseQuery(p).filters.text).toBe('t:instant cmc<=2')
  })

  it('treats zero as a real bound, not as "unset"', () => {
    const p = parseBrowseQuery(browseParams({ ...emptyFilters(), maxCmc: 0, maxPrice: 0 }, ctx(null), 1))
    expect(p.filters.maxCmc).toBe(0)
    expect(p.filters.maxPrice).toBe(0)
  })
})
