import { existsSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { afterAll, describe, expect, it } from 'vitest'
import { resolveCardsByName } from '../server/utils/cards/mtg-resolve'
import { validateAdds } from '../server/utils/suggestValidate'

const DB = '.data/cards-mtg.db'
const withDb = existsSync(DB) ? describe : describe.skip

interface Card { name: string, color_identity: string[], legalities: Record<string, string> }

withDb('resolveCardsByName', () => {
  const db = createClient({ url: `file:${DB}` })
  afterAll(() => db.close())

  it('finds a card by the name as written AND by its canonical name', async () => {
    // The Scryfall version keyed only by the canonical name, so a front-face
    // name written by the model was reported missing.
    const map = await resolveCardsByName<Card>(db, ['Delver of Secrets'])
    expect(map.get('delver of secrets')?.name).toBe('Delver of Secrets // Insectile Aberration')
    expect(map.get('delver of secrets // insectile aberration')).toBeDefined()
  })

  it('exposes exactly what the validation gate reads', async () => {
    const map = await resolveCardsByName<Card>(db, ['Sol Ring', 'Atraxa, Praetors\' Voice'])
    expect(map.get('sol ring')?.legalities.commander).toBe('legal')
    expect(map.get('atraxa, praetors\' voice')?.color_identity).toEqual(['W', 'U', 'B', 'G'])
  })

  it('leaves unknown and blank names out', async () => {
    expect((await resolveCardsByName(db, ['Not A Real Card', '  ', ''])).size).toBe(0)
  })
})

withDb('validateAdds — the AI suggestion gate', () => {
  it('keeps only real, in-identity, not-yet-present cards', async () => {
    const { add, dropped } = await validateAdds(
      [
        { name: 'Delver of Secrets', reason: 'written by its front face' },
        { name: 'Lightning Bolt', reason: 'red, outside a mono-blue identity' },
        { name: 'Totally Invented Card', reason: 'a hallucination' },
        { name: 'Sol Ring', reason: 'already in the deck' },
      ],
      new Set(['u']),
      new Set(['sol ring']),
    )
    expect(add.map(a => a.name)).toEqual(['Delver of Secrets // Insectile Aberration'])
    expect(dropped).toBe(3)
  })
})
