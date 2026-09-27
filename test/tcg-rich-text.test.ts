import { describe, expect, it } from 'vitest'
import { decodeEntities, richText, riftSymbol } from '../app/utils/tcg/richText'

describe('richText', () => {
  it('cuts Riftbound symbols out of the text', () => {
    expect(richText('Pay :rb_energy_1::rb_rune_fury: to ready me.')).toEqual([
      { kind: 'text', value: 'Pay ' },
      { kind: 'symbol', id: 'rb_energy_1' },
      { kind: 'symbol', id: 'rb_rune_fury' },
      { kind: 'text', value: ' to ready me.' },
    ])
  })

  it('cuts bracketed keywords only when asked', () => {
    expect(richText('[Accélération] (Vous pouvez payer.)', { keywords: true })).toEqual([
      { kind: 'keyword', value: 'Accélération' },
      { kind: 'text', value: ' (Vous pouvez payer.)' },
    ])
    expect(richText('[Dragon/Effect]')).toEqual([{ kind: 'text', value: '[Dragon/Effect]' }])
  })

  it('decodes the entities the sources carry', () => {
    expect(decodeEntities('[Deathknell][&gt;] Repeat &amp; more')).toBe('[Deathknell][>] Repeat & more')
    expect(richText('[&gt;]', { keywords: true })).toEqual([{ kind: 'keyword', value: '>' }])
  })

  it('reads what a symbol stands for', () => {
    expect(riftSymbol('rb_energy_12')).toEqual({ kind: 'energy', n: 12 })
    expect(riftSymbol('rb_rune_rainbow')).toEqual({ kind: 'rune', rune: 'rainbow' })
    expect(riftSymbol('rb_might')).toEqual({ kind: 'might' })
    expect(riftSymbol('rb_exhaust')).toEqual({ kind: 'exhaust' })
    expect(riftSymbol('rb_other')).toEqual({ kind: 'unknown' })
  })
})
