import { existsSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { resolveEntries } from '../server/utils/cards/mtg-resolve'
import { openCardDb } from './support/card-db'

const DB = '.data/cards-mtg.db'
const withDb = existsSync(DB) ? describe : describe.skip

withDb('resolveEntries', () => {
  const db = openCardDb()
  afterAll(() => db.close())

  it('resolves by canonical name, whatever the case', async () => {
    const [a, b] = await resolveEntries(db, [{ name: 'Sol Ring' }, { name: 'SOL RING' }], 'en')
    expect(a!.card?.name).toBe('Sol Ring')
    expect(b!.card?.name).toBe('Sol Ring')
    expect(a!.lang).toBe('en')
  })

  it('prefers a French printing when the site is in French', async () => {
    const [r] = await resolveEntries(db, [{ name: 'Cultivate' }], 'fr')
    expect(r!.lang).toBe('fr')
    expect(r!.card?.printed_name).toBe('Culture')
  })

  it('honours a pinned printing, in its French version', async () => {
    const [r] = await resolveEntries(db, [{ name: 'Cultivate', set: 'M21', collectorNumber: '177' }], 'fr')
    expect(r!.card?.set).toBe('m21')
    expect(r!.card?.collector_number).toBe('177')
    expect(r!.lang).toBe('fr')
  })

  it('never swaps a pinned printing for another art', async () => {
    // Deliberately pin a printing best_printings would NOT pick — otherwise this
    // test would pass whether or not the pin is honoured.
    const { rows } = await db.execute(`
      SELECT p.set_code, p.collector_number
        FROM printings p
        JOIN oracle_cards o ON o.oracle_id = p.oracle_id
        JOIN best_printings b ON b.oracle_id = p.oracle_id AND b.lang = 'en'
       WHERE p.lang = 'en' AND p.id <> b.printing_id AND o.name = 'Sol Ring'
       LIMIT 1`)
    const alt = rows[0]!
    const [r] = await resolveEntries(db, [{
      name: 'Sol Ring',
      set: String(alt.set_code),
      collectorNumber: String(alt.collector_number),
    }], 'en')
    expect(r!.card?.set).toBe(alt.set_code)
    expect(r!.card?.collector_number).toBe(alt.collector_number)
  })

  it('finds a double-faced card by its full name and by its front face', async () => {
    const [full, front] = await resolveEntries(db, [
      { name: 'Delver of Secrets // Insectile Aberration' },
      { name: 'Delver of Secrets' },
    ], 'en')
    expect(full!.card?.name).toBe('Delver of Secrets // Insectile Aberration')
    expect(front!.card?.name).toBe('Delver of Secrets // Insectile Aberration')
  })

  it('prefers the real card over an art-series reprint sharing its name', async () => {
    const [r] = await resolveEntries(db, [{ name: 'Brutal Cathar' }], 'en')
    expect(r!.card?.layout).toBe('transform')
  })

  it('still returns a card whose printings all lack a real image', async () => {
    // Found by query, not hard-coded: the next ingest may change which cards
    // these are. The old client returned them with placeholder art.
    const { rows } = await db.execute(`
      SELECT o.name FROM oracle_cards o
       WHERE o.is_extra = 0
         AND NOT EXISTS (SELECT 1 FROM best_printings b WHERE b.oracle_id = o.oracle_id)
         AND EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = o.oracle_id AND p.lang = 'en')
       LIMIT 1`)
    if (!rows.length)
      return // none in the current dataset: nothing to guard against
    const [r] = await resolveEntries(db, [{ name: String(rows[0]!.name) }], 'en')
    expect(r!.card).not.toBeNull()
  })

  it('reports unknown cards with the message the client used to show', async () => {
    const [r] = await resolveEntries(db, [{ name: 'Not A Real Card Xyz' }], 'en')
    expect(r!.card).toBeNull()
    expect(r!.error).toBe('Carte introuvable: Not A Real Card Xyz')
  })

  it('preserves input order, unknown cards included', async () => {
    const names = ['Sol Ring', 'Not Real', 'Cultivate', 'Command Tower']
    const out = await resolveEntries(db, names.map(name => ({ name })), 'en')
    expect(out.map(r => r.card?.name ?? null)).toEqual(['Sol Ring', null, 'Cultivate', 'Command Tower'])
  })

  it('resolves a whole Commander deck in one fast pass', async () => {
    const { rows } = await db.execute(`
      SELECT name FROM oracle_cards
       WHERE legal_commander = 1 AND is_extra = 0
       ORDER BY edhrec_sort LIMIT 100`)
    const entries = rows.map(r => ({ name: String(r.name) }))
    await resolveEntries(db, entries, 'fr') // warm the page cache
    const t = performance.now()
    const out = await resolveEntries(db, entries, 'fr')
    const ms = performance.now() - t
    expect(out.every(r => r.card)).toBe(true)
    // The client cascade needed up to five network calls per card.
    expect(ms).toBeLessThan(150)
  })
})
