import { describe, expect, it } from 'vitest'
import { parseBrowseQuery } from '../server/utils/cards/browse-params'

describe('parseBrowseQuery', () => {
  it('falls back to an unfiltered, popularity-sorted first page', () => {
    const p = parseBrowseQuery({})
    expect(p.filters).toEqual({
      text: '',
      themes: [],
      type: '',
      subtype: '',
      colors: [],
      maxCmc: null,
      maxPrice: null,
      commanderOnly: false,
    })
    expect(p.ctx).toEqual({ identity: null, lang: 'en' })
    expect(p.order).toBe('edhrec')
    expect(p.page).toBe(1)
  })

  it('tells "no identity" apart from a colourless commander', () => {
    // These two must never collapse: one disables the filter, the other is the
    // strictest filter there is.
    expect(parseBrowseQuery({}).ctx.identity).toBeNull()
    expect(parseBrowseQuery({ identity: '' }).ctx.identity).toEqual([])
  })

  it('reads colours case-insensitively, deduplicated, ignoring junk', () => {
    expect(parseBrowseQuery({ identity: 'wubx w' }).ctx.identity).toEqual(['W', 'U', 'B'])
    expect(parseBrowseQuery({ colors: 'g;r' }).filters.colors).toEqual(['G', 'R'])
  })

  it('keeps only known themes, never prototype keys', () => {
    const p = parseBrowseQuery({ themes: 'draw, toString,constructor,nope,flying' })
    expect(p.filters.themes).toEqual(['draw', 'flying'])
  })

  it('accepts only allowlisted types and sort orders', () => {
    expect(parseBrowseQuery({ type: 'creature' }).filters.type).toBe('creature')
    expect(parseBrowseQuery({ type: 'creature; DROP TABLE' }).filters.type).toBe('')
    expect(parseBrowseQuery({ order: 'eur' }).order).toBe('eur')
    expect(parseBrowseQuery({ order: 'rowid' }).order).toBe('edhrec')
  })

  it('bounds numbers and treats anything else as no filter', () => {
    expect(parseBrowseQuery({ maxCmc: '3' }).filters.maxCmc).toBe(3)
    expect(parseBrowseQuery({ maxCmc: '-1' }).filters.maxCmc).toBeNull()
    expect(parseBrowseQuery({ maxCmc: '999' }).filters.maxCmc).toBeNull()
    expect(parseBrowseQuery({ maxPrice: 'abc' }).filters.maxPrice).toBeNull()
    expect(parseBrowseQuery({ maxPrice: '0' }).filters.maxPrice).toBe(0)
  })

  it('clamps the page into a sane range', () => {
    expect(parseBrowseQuery({ page: '0' }).page).toBe(1)
    expect(parseBrowseQuery({ page: '99999' }).page).toBe(1000)
    expect(parseBrowseQuery({ page: 'x' }).page).toBe(1)
  })

  it('caps free text and takes the first of repeated values', () => {
    expect(parseBrowseQuery({ text: 'a'.repeat(500) }).filters.text).toHaveLength(200)
    expect(parseBrowseQuery({ lang: ['fr', 'en'] }).ctx.lang).toBe('fr')
  })

  it('reads the commander-only flag', () => {
    expect(parseBrowseQuery({ commanderOnly: '1' }).filters.commanderOnly).toBe(true)
    expect(parseBrowseQuery({ commanderOnly: 'true' }).filters.commanderOnly).toBe(true)
    expect(parseBrowseQuery({ commanderOnly: 'yes' }).filters.commanderOnly).toBe(false)
  })
})
