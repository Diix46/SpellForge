import { describe, expect, it } from 'vitest'
import { addToDecklist } from '../shared/deckAdd'
import { parseMtgDecklist } from '../shared/mtg/decklist'

describe('addToDecklist', () => {
  it('adds a Magic card once, the commander kept first', () => {
    const raw = 'Commander\n1 Krenko, Mob Boss\n\nDeck\n1 Sol Ring'
    const out = addToDecklist('mtg', raw, 'Goblin Matron')
    expect(out.added).toBe(true)
    const parsed = parseMtgDecklist(out.raw)
    expect(parsed.commanders).toEqual(['Krenko, Mob Boss'])
    expect(parsed.mainboard.map(e => e.name)).toContain('Goblin Matron')
    expect(addToDecklist('mtg', out.raw, 'Sol Ring').added).toBe(false)
  })

  it('counts One Piece copies up', () => {
    expect(addToDecklist('optcg', '1xOP01-001\n2xOP01-016', 'op01-016').raw).toBe('1xOP01-001\n3xOP01-016')
    expect(addToDecklist('optcg', '1xOP01-001', 'OP01-017').raw).toBe('1xOP01-001\n1xOP01-017')
  })

  it('keeps a generic deck\'s zones and format, the card in its zone', () => {
    const raw = '// format: expanded\n3 sv03.5-006\n## Extra\n1 LOB-EN001'
    const pk = addToDecklist('pokemon', '// format: expanded\n3 sv03.5-006', 'sv03.5-006').raw
    expect(pk).toBe('// format: expanded\n4 sv03.5-006')
    const ygo = addToDecklist('yugioh', '3 LOB-EN005\n## Extra\n1 LOB-EN001', 'MAMO-EN038', 'extra').raw
    expect(ygo).toBe('3 LOB-EN005\n## Extra\n1 LOB-EN001\n1 MAMO-EN038')
    expect(raw).toContain('## Extra')
  })
})
