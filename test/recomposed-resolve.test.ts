import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveEntries } from '../server/utils/cards/mtg-resolve'
import { RECOMPOSED_DIR, recomposedIds } from '../server/utils/images/recomposed'
import { openCardDb } from './support/card-db'

const DB = '.data/cards-mtg.db'
const withDb = existsSync(DB) ? describe : describe.skip

withDb('the French HD card, on demand', () => {
  const db = openCardDb()
  let file = ''
  beforeAll(async () => {
    // Krenko's French printing gets a (throwaway) recomposed image.
    const [row] = await resolveEntries(db, [{ name: 'Krenko, Mob Boss', set: 'FDN', collectorNumber: '204' }], 'fr')
    file = resolve(RECOMPOSED_DIR, `${row!.card!.id}.jpg`)
    if (!existsSync(file)) {
      mkdirSync(RECOMPOSED_DIR, { recursive: true })
      writeFileSync(file, 'x')
    }
    else {
      file = ''
    }
    recomposedIds().add(String(row!.card!.id))
  })
  afterAll(() => {
    if (file)
      rmSync(file, { force: true })
    db.close()
  })

  it('keeps Scryfall\'s scan by default and says a sharp card exists', async () => {
    const [row] = await resolveEntries(db, [{ name: 'Krenko, Mob Boss', set: 'FDN', collectorNumber: '204' }], 'fr')
    const card = row!.card as Record<string, any>
    expect(card.recomposable).toBe(true)
    expect(card.recomposed).toBeUndefined()
    expect(card.image_uris.large).not.toContain('r=')
    expect(card.recomposed_image).toContain('r=')
  })

  it('shows the recomposed card for an "[HD]" line', async () => {
    const [row] = await resolveEntries(db, [{ name: 'Krenko, Mob Boss', set: 'FDN', collectorNumber: '204', hd: true }], 'fr')
    const card = row!.card as Record<string, any>
    expect(card.recomposed).toBe(true)
    expect(card.image_uris.large).toContain('r=')
  })
})
