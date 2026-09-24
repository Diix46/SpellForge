import { describe, expect, it } from 'vitest'
import { entryKey, totalCards } from '../shared/decklist'
import { mtgLine, parseMtgDecklist, withoutLangMarkers, writeMtgDecklist } from '../shared/mtg/decklist'
import { optcgLine, orderOptcgEntries, parseOptcgDecklist } from '../shared/optcg/decklist'
import { itPerf } from './support/perf'

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

  it('keeps the chosen commander in its own section', () => {
    const main = [
      { quantity: 1, name: 'Sol Ring' },
      { quantity: 1, name: 'Atraxa, Praetors\' Voice', set: 'ONE', collectorNumber: '196' },
      { quantity: 30, name: 'Forest' },
    ]
    const text = writeMtgDecklist(main, [{ quantity: 1, name: 'Duress', set: 'M21', collectorNumber: '96' }], 'atraxa, praetors\' voice')
    expect(text).toBe(['Commander', '1 Atraxa, Praetors\' Voice (ONE) 196', '', 'Deck', '1 Sol Ring', '30 Forest', '', 'Sideboard', '1 Duress (M21) 96'].join('\n'))
    const back = parseMtgDecklist(text)
    expect(back.commanders).toEqual(['Atraxa, Praetors\' Voice'])
    expect(back.mainboard.map(e => e.name)).toEqual(['Atraxa, Praetors\' Voice', 'Sol Ring', 'Forest'])
    expect(back.sideboard[0]).toEqual({ quantity: 1, name: 'Duress', set: 'M21', collectorNumber: '96' })
    // No choice, or a commander no longer in the list: a plain list.
    expect(writeMtgDecklist(main, [], 'Kenrith')).toBe('1 Sol Ring\n1 Atraxa, Praetors\' Voice (ONE) 196\n30 Forest')
  })

  it('round-trips an "[EN]" pin, and drops the marker for other sites', () => {
    const r = parseMtgDecklist(['1 Boggart Shenanigans (LRW) 155 [EN]', '1 Sol Ring [en]', '1 Forest (SLD) 1494★'].join('\n'))
    expect(r.mainboard).toEqual([
      { quantity: 1, name: 'Boggart Shenanigans', set: 'LRW', collectorNumber: '155', lang: 'en' },
      // The marker only means something on a pinned printing.
      { quantity: 1, name: 'Sol Ring', set: undefined, collectorNumber: undefined },
      { quantity: 1, name: 'Forest', set: 'SLD', collectorNumber: '1494★' },
    ])
    expect(r.mainboard.map(mtgLine)).toEqual(['1 Boggart Shenanigans (LRW) 155 [EN]', '1 Sol Ring', '1 Forest (SLD) 1494★'])
    expect(withoutLangMarkers('1 Boggart Shenanigans (LRW) 155 [EN]\n1 Sol Ring')).toBe('1 Boggart Shenanigans (LRW) 155\n1 Sol Ring')
  })

  it('keeps the companion out of the hundred', () => {
    const r = parseMtgDecklist('Companion\n1 Lurrus of the Dream-Den\nDeck\n1 Sol Ring')
    expect(r.sideboard.map(e => e.name)).toEqual(['Lurrus of the Dream-Den'])
    expect(r.mainboard.map(e => e.name)).toEqual(['Sol Ring'])
  })

  it('pins printings whose collector number is not only digits', () => {
    const r = parseMtgDecklist(['1 Sol Ring (plst) BLC-129', '1 Forest (SLD) 1494★', '1 Island (THB) 251a', '1 Card (Named) Thing'].join('\n'))
    expect(r.mainboard).toEqual([
      { quantity: 1, name: 'Sol Ring', set: 'PLST', collectorNumber: 'BLC-129' },
      { quantity: 1, name: 'Forest', set: 'SLD', collectorNumber: '1494★' },
      { quantity: 1, name: 'Island', set: 'THB', collectorNumber: '251a' },
      { quantity: 1, name: 'Card (Named) Thing', set: undefined, collectorNumber: undefined },
    ])
    expect(r.mainboard.map(mtgLine)).toEqual(['1 Sol Ring (PLST) BLC-129', '1 Forest (SLD) 1494★', '1 Island (THB) 251a', '1 Card (Named) Thing'])
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

  itPerf('reads a long line in linear time', () => {
    const t = performance.now()
    parseOptcgDecklist(`4${' '.repeat(50_000)}zz`)
    expect(performance.now() - t).toBeLessThan(200)
    expect(entryKey('  OP01-016 ')).toBe('op01-016')
  })
})
