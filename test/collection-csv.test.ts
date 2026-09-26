import type { CollectionCopy } from '../shared/collection'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { conditionOf, exportCollection, finishOf, parseCsv, parseImport } from '../shared/collection-csv'

describe('csv', () => {
  it('reads quoted fields, doubled quotes, line breaks and the delimiter', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']])
    expect(parseCsv('a;b\r\n1;"2\n3"')).toEqual([['a', 'b'], ['1', '2\n3']])
    expect(parseCsv('﻿a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('maps conditions and finishes from every app\'s words', () => {
    expect(conditionOf('near_mint')).toBe('NM')
    expect(conditionOf('Lightly Played')).toBe('LP')
    expect(conditionOf('EX')).toBe('EX')
    expect(conditionOf('Damaged')).toBe('PO')
    expect(conditionOf('')).toBeNull()
    expect(finishOf('normal')).toBe('nonfoil')
    expect(finishOf('etched')).toBe('etched')
    expect(finishOf('X')).toBe('foil')
    expect(finishOf('')).toBeNull()
  })
})

describe('import', () => {
  it('reads a ManaBox export', () => {
    const r = parseImport([
      'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency',
      'Sol Ring,CMM,Commander Masters,400,foil,uncommon,3,123,abc-id,"1,50",false,false,near_mint,fr,EUR',
    ].join('\n'))
    expect(r.format).toBe('manabox')
    expect(r.rows[0]).toMatchObject({ name: 'Sol Ring', set: 'cmm', number: '400', printingId: 'abc-id', finish: 'foil', quantity: 3, condition: 'NM', lang: 'fr', purchasePrice: 1.5 })
  })

  it('reads a Moxfield export', () => {
    const r = parseImport([
      '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number","Alter","Proxy","Purchase Price"',
      '"2","0","Blood Moon","wot","Lightly Played","English","","","2024-01-01","40","False","False",""',
    ].join('\n'))
    expect(r.format).toBe('moxfield')
    expect(r.rows[0]).toMatchObject({ name: 'Blood Moon', set: 'wot', number: '40', condition: 'LP', lang: 'en', finish: 'nonfoil', quantity: 2 })
  })

  it('reads a Cardmarket export (semicolons, numbered languages)', () => {
    const r = parseImport([
      'idArticle;idProduct;English Name;Local Name;Exp.;Exp. Name;Price;Language;Condition;Foil?;Amount',
      '1;2;Sol Ring;Anneau solaire;CMM;Commander Masters;1.2;2;EX;X;4',
    ].join('\n'))
    expect(r.format).toBe('cardmarket')
    expect(r.rows[0]).toMatchObject({ name: 'Sol Ring', setName: 'Commander Masters', lang: 'fr', condition: 'EX', finish: 'foil', quantity: 4 })
  })

  it('keeps an unknown language apart and flags unreadable lines', () => {
    const r = parseImport('Name,Quantity,Language\nSol Ring,1,Japanese\nBlood Moon,two,English\n,3,English')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ lang: null, otherLang: 'Japanese' })
    expect(r.errors.map(e => e.line)).toEqual([2, 3])
  })

  it('reads a card list', () => {
    const r = parseImport('Deck\n4 Sol Ring (CMM) 400 *F*\n1x Blood Moon\n// comment\n4x OP01-016')
    expect(r.format).toBe('text')
    expect(r.rows.map(x => [x.quantity, x.name, x.set, x.number, x.finish])).toEqual([
      [4, 'Sol Ring', 'cmm', '400', 'foil'],
      [1, 'Blood Moon', null, null, 'nonfoil'],
      [4, 'OP01-016', null, null, 'nonfoil'],
    ])
  })
})

describe('export', () => {
  const copy: CollectionCopy = {
    id: 'c_1',
    game: 'mtg',
    printingId: 'abc-id',
    finish: 'foil',
    condition: 'LP',
    quantity: 2,
    lang: 'fr',
    purchasePrice: 3,
    location: 'Classeur, rouge',
    note: null,
    createdAt: 0,
    updatedAt: 0,
    card: { name: 'Sol Ring', printedName: 'Anneau solaire', lang: 'fr', set: 'cmm', setName: 'Commander Masters', setIcon: null, number: '400', rarity: 'uncommon', releasedAt: null, typeLine: null, colors: [], manaCost: null, image: '', thumb: '', price: 1, priceFoil: 2, finishes: ['nonfoil', 'foil'] },
  }

  it('writes each format, and reads its own back', () => {
    const prism = exportCollection([copy], 'prism')
    expect(prism.split('\r\n')[1]).toBe('abc-id,Sol Ring,cmm,Commander Masters,400,fr,foil,LP,2,3,"Classeur, rouge",')
    expect(parseImport(prism).rows[0]).toMatchObject({ printingId: 'abc-id', finish: 'foil', condition: 'LP', quantity: 2, location: 'Classeur, rouge', lang: 'fr' })
    expect(parseImport(exportCollection([copy], 'manabox')).rows[0]).toMatchObject({ printingId: 'abc-id', condition: 'LP', finish: 'foil' })
    expect(parseImport(exportCollection([copy], 'moxfield')).rows[0]).toMatchObject({ name: 'Sol Ring', set: 'cmm', number: '400', lang: 'fr' })
    expect(exportCollection([copy], 'text')).toBe('2 Sol Ring (CMM) 400 *F*')
  })
})

describe.skipIf(!existsSync('.data/cards-mtg.db') || !existsSync('.data/cards-optcg.db'))('import matching against the card databases', () => {
  it('matches Magic rows by id, set and number, English or French name', async () => {
    const { resolveImport } = await import('../server/utils/collection/import')
    const { rows } = parseImport([
      'Name,Set code,Collector number,Language,Foil,Quantity',
      'Sol Ring,,,,,1',
      ',blb,20,fr,,2',
      'Anneau solaire,,,fr,,1',
      'Card That Does Not Exist,,,,,1',
      'Sol Ring,zzz,,,etched,1',
      'Blood Moon,,,Japanese,,1',
    ].join('\n'))
    const got = await resolveImport('mtg', rows)
    expect(got[0]).toMatchObject({ error: null, warnings: [], card: { name: 'Sol Ring', lang: 'en' } })
    expect(got[1]).toMatchObject({ error: null, card: { set: 'blb', number: '20', lang: 'fr' }, quantity: 2 })
    expect(got[2]).toMatchObject({ error: null, card: { name: 'Sol Ring', lang: 'fr' } })
    expect(got[3]).toMatchObject({ error: 'notFound', printingId: null })
    expect(got[4]!.warnings).toContain('setNotFound')
    expect(got[5]!.warnings).toEqual(['otherLang'])
  })

  it('matches One Piece rows by card number or art', async () => {
    const { resolveImport } = await import('../server/utils/collection/import')
    const got = await resolveImport('optcg', parseImport('4x OP01-016\n1x OP01-016_p1\n1x ZZ99-999').rows)
    // The number alone: its usual French printing.
    expect(got.map(r => r.printingId)).toEqual(['fr:OP01-016_p1', 'fr:OP01-016_p1', null])
    expect(got[0]).toMatchObject({ warnings: [], card: { number: 'OP01-016', lang: 'fr' } })
    expect(got[2]!.error).toBe('notFound')
  })
})

describe.skipIf(!existsSync('.data/cards-mtg.db'))('import defaults', () => {
  it('takes a regular set\'s printing for a name alone', async () => {
    const { resolveImport } = await import('../server/utils/collection/import')
    const got = await resolveImport('mtg', parseImport('1 Blood Moon\n1 Lightning Bolt').rows)
    for (const r of got)
      expect(['sld', 'plst']).not.toContain(r.card?.set)
  })
})

describe.skipIf(!existsSync('.data/cards-mtg.db'))('a copy\'s own language', () => {
  it('keeps a French copy of a printing Scryfall only lists in English', async () => {
    const { resolveImport } = await import('../server/utils/collection/import')
    // Arcane Signet from the Doctor Doom deck: no French printing at Scryfall.
    const [got] = await resolveImport('mtg', parseImport('Name,Set code,Collector number,Language\nArcane Signet,msc,193,fr').rows)
    expect(got).toMatchObject({ lang: 'fr', warnings: ['langKept'], card: { set: 'msc', number: '193', lang: 'en' } })
  })
})
