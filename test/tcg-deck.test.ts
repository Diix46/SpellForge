import type { TcgLine } from '../shared/tcg/deck'
import type { TcgCard } from '../shared/tcg/types'
import { describe, expect, it } from 'vitest'
import { canAdd, parseForeignLines, parseTcgDecklist, readTcgFormat, validateTcgDeck, writeTcgDecklist } from '../shared/tcg/deck'
import { POKEMON_RULES } from '../shared/tcg/games/pokemon'
import { TCG_RULES } from '../shared/tcg/rules'
import { TCG_GAME_IDS } from '../shared/tcg/types'

function card(id: string, over: Partial<TcgCard> = {}): TcgCard {
  const name = over.name ?? id
  return {
    id,
    lang: 'en',
    key: name.toLowerCase(),
    name,
    nameEn: null,
    number: '1',
    set: 'sv01',
    setName: null,
    rarity: 'Common',
    category: 'Pokemon',
    subtype: 'Basic',
    types: ['Fire'],
    stats: {},
    text: null,
    image: '',
    thumb: '',
    finishes: ['normal'],
    price: null,
    priceFoil: null,
    regulation: 'H',
    legal: ['standard', 'expanded'],
    banned: false,
    illustrator: null,
    attacks: [],
    abilities: [],
    weaknesses: [],
    resistances: [],
    evolveFrom: null,
    suffix: null,
    ...over,
  }
}
const line = (c: TcgCard, quantity: number, zone?: string): TcgLine => ({ entry: { quantity, name: c.id, ...(zone ? { zone } : {}) }, card: c })

const charmander = card('sv01-4', { name: 'Charmander' })
const fire = card('sve-2', { name: 'Basic Fire Energy', category: 'Energy', subtype: 'Normal', types: [] })
const rareCandy = card('sv01-191', { name: 'Rare Candy', category: 'Trainer', subtype: 'Item', types: [] })
const ace = card('sv05-144', { name: 'Prime Catcher', category: 'Trainer', subtype: 'Item', rarity: 'ACE SPEC Rare', types: [] })
const ace2 = card('sv06-167', { name: 'Legacy Energy', category: 'Energy', subtype: 'Special', rarity: 'ACE SPEC Rare', types: [] })
const radiant = card('swsh10-26', { name: 'Radiant Charizard', legal: ['expanded'] })
const radiant2 = card('swsh11-46', { name: 'Radiant Greninja' })

describe('generic decklist', () => {
  const zones = [{ id: 'main', min: 40, max: 60 }, { id: 'extra', min: 0, max: 15 }]

  it('reads quantities, ids, zones and ignores names', () => {
    const r = parseTcgDecklist('4 sv03.5-006 Charizard ex\n2x sve-2\n## Extra\n1 89631139\nnot a line', zones)
    expect(r.mainboard).toEqual([
      { quantity: 4, name: 'sv03.5-006' },
      { quantity: 2, name: 'sve-2' },
      { quantity: 1, name: '89631139', zone: 'extra' },
    ])
    expect(r.errors).toEqual(['not a line'])
  })

  it('writes zone by zone, the format first when not the default', () => {
    const entries = [{ quantity: 1, name: 'b', zone: 'extra' }, { quantity: 3, name: 'a' }]
    expect(writeTcgDecklist(entries, zones, ['??'], { value: 'expanded', formats: ['standard', 'expanded'] }))
      .toBe('// format: expanded\n3 a\n## Extra\n1 b\n??')
    const text = writeTcgDecklist(entries, zones)
    expect(parseTcgDecklist(text, zones).mainboard).toEqual([{ quantity: 3, name: 'a' }, { quantity: 1, name: 'b', zone: 'extra' }])
  })

  it('reads the format a list names, else the first one', () => {
    expect(readTcgFormat('// format: expanded\n4 a', ['standard', 'expanded'])).toBe('expanded')
    expect(readTcgFormat('// format: unlimited\n4 a', ['standard', 'expanded'])).toBe('standard')
    expect(readTcgFormat('4 a', ['standard', 'expanded'])).toBe('standard')
  })

  it('reads Pokémon TCG Live lines', () => {
    const r = parseForeignLines(['Pokémon: 12', '4 Charizard ex OBF 125', '8 Basic {R} Energy Energy 2', '2 Arven', 'Total Cards: 60', 'hello'])
    expect(r.lines).toEqual([
      { quantity: 4, name: 'Charizard ex', set: 'OBF', number: '125' },
      { quantity: 8, name: 'Basic Fire Energy', set: null, number: null },
      { quantity: 2, name: 'Arven', set: null, number: null },
    ])
    expect(r.rest).toEqual(['hello'])
  })
})

describe('pokémon rules', () => {
  it('holds at most four copies of a card, whatever the printing', () => {
    const alt = card('sv03.5-4', { name: 'Charmander' })
    expect(canAdd(POKEMON_RULES, [line(charmander, 3)], alt)).toEqual({ ok: true, zone: 'main' })
    expect(canAdd(POKEMON_RULES, [line(charmander, 3), line(alt, 1)], charmander)).toEqual({ ok: false, reason: 'maxCopies' })
  })

  it('lets basic Energy go beyond four', () => {
    expect(canAdd(POKEMON_RULES, [line(fire, 20)], fire).ok).toBe(true)
  })

  it('allows one ACE SPEC and one Radiant Pokémon', () => {
    expect(canAdd(POKEMON_RULES, [line(ace, 1)], ace2)).toEqual({ ok: false, reason: 'aceSpec' })
    expect(canAdd(POKEMON_RULES, [line(radiant, 1)], radiant2)).toEqual({ ok: false, reason: 'radiant' })
  })

  it('validates a 60-card deck with a Basic Pokémon', () => {
    const ok = validateTcgDeck(POKEMON_RULES, [line(charmander, 4), line(rareCandy, 4), line(fire, 52)])
    expect(ok.legal).toBe(true)
    expect(ok.counts.main).toBe(60)

    const noBasic = validateTcgDeck(POKEMON_RULES, [line(rareCandy, 4), line(fire, 56)])
    expect(noBasic.issues.map(i => i.code)).toContain('noBasicPokemon')

    const short = validateTcgDeck(POKEMON_RULES, [line(charmander, 4), line(fire, 50)])
    expect(short.issues).toContainEqual({ code: 'zoneSize', level: 'error', zone: 'main', count: 54, max: 60 })

    const twoAce = validateTcgDeck(POKEMON_RULES, [line(charmander, 4), line(ace, 1), line(ace2, 1), line(fire, 54)])
    expect(twoAce.issues.map(i => i.code)).toContain('aceSpec')
  })

  it('warns about cards out of the format, without making the deck illegal', () => {
    const v = validateTcgDeck(POKEMON_RULES, [line(charmander, 4), line(radiant, 1), line(fire, 55)], 'standard')
    expect(v.issues).toContainEqual({ code: 'notInFormat', level: 'warning', cards: ['Radiant Charizard'] })
    expect(v.legal).toBe(true)
    expect(validateTcgDeck(POKEMON_RULES, [line(charmander, 4), line(radiant, 1), line(fire, 55)], 'expanded').issues).toEqual([])
  })
})

describe('generic engine registry', () => {
  it('has rules for every game', () => {
    for (const g of TCG_GAME_IDS)
      expect(TCG_RULES[g].zones.length).toBeGreaterThan(0)
  })
})
