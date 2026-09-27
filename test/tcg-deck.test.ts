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
    code: null,
    limit: null,
    race: null,
    archetype: null,
    linkMarkers: [],
    extraDeck: false,
    tags: [],
    landscape: false,
    flavour: null,
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
    const entries = [{ quantity: 1, name: 'b-2', zone: 'extra' }, { quantity: 3, name: 'a-1' }]
    expect(writeTcgDecklist(entries, zones, ['??'], { value: 'expanded', formats: ['standard', 'expanded'] }))
      .toBe('// format: expanded\n3 a-1\n## Extra\n1 b-2\n??')
    const text = writeTcgDecklist(entries, zones)
    expect(parseTcgDecklist(text, zones).mainboard).toEqual([{ quantity: 3, name: 'a-1' }, { quantity: 1, name: 'b-2', zone: 'extra' }])
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

describe('the generic ingest and the app agree', () => {
  it('on the schema version the boot rebuild compares', async () => {
    const { readFileSync } = await import('node:fs')
    const { TCG_SCHEMA_VERSION } = await import('../server/utils/tcg/db')
    expect(readFileSync('scripts/tcg/schema.mjs', 'utf8')).toContain(`const SCHEMA_VERSION = '${TCG_SCHEMA_VERSION}'`)
  })

  it('has an ingest script per game', async () => {
    const { existsSync } = await import('node:fs')
    for (const g of TCG_GAME_IDS)
      expect(existsSync(`scripts/ingest-${g}.mjs`)).toBe(true)
  })
})

describe('yu-gi-oh rules', () => {
  const mon = (id: string, over: Partial<TcgCard> = {}) => card(id, { category: 'Monster', subtype: 'Effect', types: ['DARK'], legal: ['tcg'], ...over })
  const ash = mon('RA01-EN008', { name: 'Ash Blossom' })
  const limited = mon('LOB-EN001', { name: 'Pot of Greed', category: 'Spell', limit: 1 })
  const fusion = mon('LOB-EN050', { name: 'Thousand Dragon', subtype: 'Fusion', extraDeck: true })

  it('holds three copies, fewer under the banlist', () => {
    const r = TCG_RULES.yugioh
    expect(canAdd(r, [line(ash, 3)], ash)).toEqual({ ok: false, reason: 'maxCopies' })
    expect(canAdd(r, [line(limited, 1)], limited)).toEqual({ ok: false, reason: 'maxCopies' })
  })

  it('sends Extra Deck monsters to the Extra Deck, anything may go to the Side', () => {
    const r = TCG_RULES.yugioh
    expect(canAdd(r, [], fusion)).toEqual({ ok: true, zone: 'extra' })
    expect(canAdd(r, [], fusion, 'main')).toEqual({ ok: false, reason: 'wrongZone' })
    expect(canAdd(r, [], ash, 'side')).toEqual({ ok: true, zone: 'side' })
  })

  it('checks each deck size, the three copies spanning them', () => {
    const r = TCG_RULES.yugioh
    const fillers = Array.from({ length: 13 }, (_, i) => line(mon(`X-${i}`), 3))
    const v = validateTcgDeck(r, [line(ash, 2), line(ash, 2, 'side'), ...fillers])
    expect(v.issues.map(i => i.code)).toEqual(['tooManyCopies'])
    expect(validateTcgDeck(r, [line(mon('X-1'), 30)]).issues[0]).toMatchObject({ code: 'zoneSize', zone: 'main', count: 30, max: 40 })
  })

  it('reads a YDK file', async () => {
    const { isYdk, parseYdk } = await import('../shared/tcg/deck')
    const ydk = '#created by me\n#main\n46986414\n46986414\n#extra\n1561110\n!side\n46986414\n'
    expect(isYdk(ydk)).toBe(true)
    expect(parseYdk(ydk)).toEqual([
      { code: '46986414', zone: 'main', quantity: 2 },
      { code: '1561110', zone: 'extra', quantity: 1 },
      { code: '46986414', zone: 'side', quantity: 1 },
    ])
  })
})

describe('riftbound rules', () => {
  const rb = (id: string, over: Partial<TcgCard>) => card(id, { legal: ['standard'], ...over })
  const jinx = rb('ogn-251-298', { name: 'Jinx - Loose Cannon', category: 'Legend', subtype: null, types: ['Fury', 'Chaos'], tags: ['Jinx'] })
  const jinxUnit = rb('ogn-030-298', { name: 'Jinx - Rebel', category: 'Unit', subtype: 'Champion', types: ['Fury'], tags: ['Jinx'] })
  const viUnit = rb('ogn-100-298', { name: 'Vi - Destructive', category: 'Unit', subtype: 'Champion', types: ['Fury'], tags: ['Vi'] })
  const calm = rb('ogn-050-298', { name: 'Calm Unit', category: 'Unit', subtype: null, types: ['Calm'] })
  const fury = rb('ogn-010-298', { name: 'Get Excited!', category: 'Spell', subtype: null, types: ['Fury'] })
  const sig = rb('ogn-300-298', { name: 'Super Mega Death Rocket!', category: 'Spell', subtype: 'Signature', types: ['Fury'], tags: ['Jinx'] })
  const rune = rb('ogn-rune-f', { name: 'Fury Rune', category: 'Rune', subtype: 'Basic', types: ['Fury'] })
  const field = rb('ogn-bf-1', { name: 'Zaun Warrens', category: 'Battlefield', subtype: null, types: [] })
  const r = TCG_RULES.riftbound

  it('places each card in its zone, the first champion of the Legend as the Chosen Champion', () => {
    const lines = [line(jinx, 1, 'legend')]
    expect(canAdd(r, [], jinx)).toEqual({ ok: true, zone: 'legend' })
    expect(canAdd(r, lines, jinxUnit)).toEqual({ ok: true, zone: 'champion' })
    expect(canAdd(r, [...lines, line(jinxUnit, 1, 'champion')], jinxUnit)).toEqual({ ok: true, zone: 'main' })
    expect(canAdd(r, lines, rune)).toEqual({ ok: true, zone: 'runes' })
    expect(canAdd(r, lines, field)).toEqual({ ok: true, zone: 'battlefields' })
    expect(canAdd(r, [...lines, line(field, 1, 'battlefields')], field)).toEqual({ ok: false, reason: 'maxCopies' })
  })

  it('keeps the deck within the Legend\'s domains and its signatures to three', () => {
    const lines = [line(jinx, 1, 'legend')]
    expect(canAdd(r, lines, calm)).toEqual({ ok: false, reason: 'offDomain' })
    expect(canAdd(r, [...lines, line(sig, 3)], card('ogn-301-298', { ...sig, id: 'ogn-301-298', name: 'Other', key: 'other' }))).toEqual({ ok: false, reason: 'signatureCount' })
    expect(validateTcgDeck(r, [...lines, line(viUnit, 1, 'champion')]).issues.map(i => i.code)).toContain('chosenChampion')
  })

  it('validates a whole deck', () => {
    const fillers = Array.from({ length: 13 }, (_, i) => line(rb(`ogn-f${i}`, { name: `Filler ${i}`, category: 'Unit', subtype: null, types: ['Chaos'] }), 3))
    const deck = [line(jinx, 1, 'legend'), line(jinxUnit, 1, 'champion'), ...fillers, ...[0, 1].map(() => line(fury, 0)), line(rune, 12, 'runes'), ...['a', 'b', 'c'].map(x => line(rb(`bf-${x}`, { name: `Field ${x}`, category: 'Battlefield', subtype: null, types: [] }), 1, 'battlefields'))]
    const v = validateTcgDeck(r, deck)
    expect(v.issues).toEqual([])
    expect(v.counts).toMatchObject({ main: 39, legend: 1, champion: 1, runes: 12, battlefields: 3 })
  })
})

describe('generic decklist, names', () => {
  it('leaves a line naming a card to the import', () => {
    const r = parseTcgDecklist('1 Jinx - Loose Cannon\n3 ogn-001-298', [{ id: 'main', min: 0, max: 60 }])
    expect(r.mainboard).toEqual([{ quantity: 3, name: 'ogn-001-298' }])
    expect(r.errors).toEqual(['1 Jinx - Loose Cannon'])
  })
})
