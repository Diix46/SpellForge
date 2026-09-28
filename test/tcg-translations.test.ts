import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { SCHEMA } from '../scripts/tcg/schema.mjs'
import { applyTranslations, ensureTranslations, sourceOf, titledName } from '../scripts/tcg/translations.mjs'

describe('unofficial translations', () => {
  it('writes a French row beside the English one, the English words kept', async () => {
    const db = createClient({ url: 'file::memory:' })
    await db.batch(SCHEMA as string[], 'write')
    await db.execute({
      sql: `INSERT INTO cards (id, lang, card_key, name, name_folded, number, set_code, category, text, image, thumb, extra)
            VALUES ('ogn-251-298', 'en', 'jinx - loose cannon', 'Jinx - Loose Cannon', 'jinx - loose cannon', '251', 'OGN', 'Legend', 'Draw 1.', 'x.png', 'x.png', '{"flavour":"Boom!"}')`,
      args: [],
    })
    await db.execute(`INSERT INTO sets (code, lang, name) VALUES ('OGN', 'en', 'Origins')`)
    const tdb = createClient({ url: 'file::memory:' })
    await ensureTranslations(tdb)
    const { rows } = await db.execute('SELECT * FROM cards')
    const src = sourceOf(rows[0]!)
    await tdb.execute({ sql: 'INSERT INTO translations (hash, name, text, flavour) VALUES (?, ?, ?, ?)', args: [src.hash, 'Jinx - Canon déchaîné', 'Piochez 1.', 'Boum !'] })

    expect(await applyTranslations(db, tdb)).toBe(1)
    const { rows: [fr] } = await db.execute('SELECT * FROM cards WHERE lang = \'fr\'')
    expect(fr).toMatchObject({ id: 'ogn-251-298', name: 'Jinx - Canon déchaîné', name_en: 'Jinx - Loose Cannon', text: 'Piochez 1.', card_key: 'jinx - loose cannon' })
    expect(JSON.parse(String(fr!.extra))).toMatchObject({ translated: true, textEn: 'Draw 1.', flavour: 'Boum !', flavourEn: 'Boom!' })
    expect((await db.execute('SELECT COUNT(*) AS n FROM sets WHERE lang = \'fr\'')).rows[0]!.n).toBe(1)
  })

  it('gives a card\'s printings one French name, titled like Riftbound\'s', async () => {
    const db = createClient({ url: 'file::memory:' })
    await db.batch(SCHEMA as string[], 'write')
    for (const [id, variant, flavour] of [['ogn-019a-298', true, 'Alt'], ['ogn-019-298', false, 'Plain']] as const) {
      await db.execute({
        sql: `INSERT INTO cards (id, lang, card_key, name, name_folded, number, set_code, category, text, image, thumb, extra)
              VALUES (?, 'en', 'akali - deadly', 'Akali - Deadly', 'akali - deadly', '19', 'OGN', 'Unit', 'Strike.', 'x.png', 'x.png', ?)`,
        args: [id, JSON.stringify({ variant, flavour })],
      })
    }
    const tdb = createClient({ url: 'file::memory:' })
    await ensureTranslations(tdb)
    const { rows } = await db.execute('SELECT * FROM cards ORDER BY id')
    const names = { 'ogn-019-298': 'Akali, arme mortelle', 'ogn-019a-298': 'Akali - Arme fatale' } as Record<string, string>
    for (const r of rows) {
      const src = sourceOf(r)
      await tdb.execute({ sql: 'INSERT INTO translations (hash, name, text, flavour) VALUES (?, ?, ?, ?)', args: [src.hash, names[String(r.id)]!, 'Frappe.', null] })
    }
    expect(await applyTranslations(db, tdb, { titled: true })).toBe(2)
    const { rows: fr } = await db.execute('SELECT DISTINCT name FROM cards WHERE lang = \'fr\'')
    expect(fr.map(r => r.name)).toEqual(['Akali - Arme mortelle'])
  })

  it('titles a Riftbound name, leaves the others', () => {
    expect(titledName('Akali, arme mortelle', 'Akali - Deadly')).toBe('Akali - Arme mortelle')
    expect(titledName('Vi - justicière de Piltover', 'Vi - Piltover Enforcer')).toBe('Vi - Justicière de Piltover')
    expect(titledName('Gromp vorace', 'Voracious Gromp')).toBe('Gromp vorace')
    expect(titledName('Akali, arme mortelle', 'Akali, Deadly Weapon')).toBe('Akali, Arme mortelle')
    expect(titledName('Sona, l\'Harmonieuse', 'Sona, Harmonious')).toBe('Sona, l\'Harmonieuse')
  })

  it('keys a card by its English words: an edited card is translated again', () => {
    const a = sourceOf({ name: 'A', text: 'Draw 1.', extra: '{}' })
    const b = sourceOf({ name: 'A', text: 'Draw 2.', extra: '{}' })
    expect(a.hash).not.toBe(b.hash)
  })
})
