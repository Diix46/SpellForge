import { describe, expect, it } from 'vitest'
import { entryKey, totalCards } from '../shared/decklist'
import { mtgLine, parseMtgDecklist } from '../shared/mtg/decklist'
import { optcgLine, orderOptcgEntries, parseOptcgDecklist } from '../shared/optcg/decklist'

describe('magic decklists', () => {
  it('reads quantities, Arena suffixes and sections', () => {
    const r = parseMtgDecklist([
      'Commander',
      '1 Atraxa, Praetors\' Voice',
      'Deck',
      '1 Sol Ring',
      '2 Cultivate (M21) 177',
      '',
      'Sideboard',
      '1 Duress',
      'not a card line',
    ].join('\n'))
    expect(r.mainboard).toEqual([
      { quantity: 1, name: 'Atraxa, Praetors\' Voice', set: undefined, collectorNumber: undefined },
      { quantity: 1, name: 'Sol Ring', set: undefined, collectorNumber: undefined },
      { quantity: 2, name: 'Cultivate', set: 'M21', collectorNumber: '177' },
    ])
    expect(r.sideboard.map(e => e.name)).toEqual(['Duress'])
    expect(r.errors).toEqual(['not a card line'])
  })

  it('writes a pinned printing back as the Arena suffix', () => {
    expect(mtgLine({ quantity: 2, name: 'Cultivate', set: 'm21', collectorNumber: '177' })).toBe('2 Cultivate (M21) 177')
    expect(mtgLine({ quantity: 1, name: 'Sol Ring' })).toBe('1 Sol Ring')
    const raw = ['1 Sol Ring', '2 Cultivate (M21) 177'].join('\n')
    expect(parseMtgDecklist(raw).mainboard.map(mtgLine).join('\n')).toBe(raw)
  })
})

describe('one Piece decklists', () => {
  it('reads simulator exports and pasted lists', () => {
    const r = parseOptcgDecklist([
      '1xOP01-001',
      '4xOP01-016',
      '4 op01-025 Roronoa Zoro',
      '2x OP01-016_p1',
      '3×ST01-012_r1',
      '# comment',
      'Nami',
    ].join('\n'))
    expect(r.mainboard).toEqual([
      { quantity: 1, name: 'OP01-001' },
      { quantity: 4, name: 'OP01-016' },
      { quantity: 4, name: 'OP01-025' },
      { quantity: 2, name: 'OP01-016', art: 'OP01-016_p1' },
      // A reprint is the same card: no art to keep.
      { quantity: 3, name: 'ST01-012' },
    ])
    expect(r.sideboard).toEqual([])
    expect(r.errors).toEqual(['Nami'])
  })

  it('round-trips, alternate arts included', () => {
    const raw = ['1xOP01-001', '4xOP01-016', '2xOP01-016_p1', '4xP-001'].join('\n')
    expect(parseOptcgDecklist(raw).mainboard.map(optcgLine).join('\n')).toBe(raw)
    expect(totalCards(parseOptcgDecklist(raw).mainboard)).toBe(11)
  })

  it('writes the leader first', () => {
    const entries = parseOptcgDecklist(['4xOP01-016', '1xOP01-001', '4xOP01-025'].join('\n')).mainboard
    const ordered = orderOptcgEntries(entries, n => n === 'OP01-001')
    expect(ordered.map(e => e.name)).toEqual(['OP01-001', 'OP01-016', 'OP01-025'])
  })

  it('reads a long line in linear time', () => {
    const t = performance.now()
    parseOptcgDecklist(`4${' '.repeat(50_000)}zz`)
    expect(performance.now() - t).toBeLessThan(200)
    expect(entryKey('  OP01-016 ')).toBe('op01-016')
  })
})
