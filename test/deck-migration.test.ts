import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterAll, describe, expect, it } from 'vitest'

const MIGRATIONS = 'server/db/migrations'
const dir = mkdtempSync(join(tmpdir(), 'prism-migration-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A copy of the migrations folder that stops before `stopAt`. */
function migrationsUntil(stopAt: string): string {
  const out = join(dir, `until-${stopAt}`)
  cpSync(MIGRATIONS, out, { recursive: true })
  const journalPath = join(out, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  journal.entries = journal.entries.filter((e: { tag: string }) => e.tag < stopAt)
  writeFileSync(journalPath, JSON.stringify(journal))
  return out
}

describe('the deck game migration', () => {
  it('files every existing deck under Magic', async () => {
    const client = createClient({ url: `file:${join(dir, 'app.db')}` })
    const db = drizzle(client)

    // The schema as deployed before One Piece, with a real deck in it.
    await migrate(db, { migrationsFolder: migrationsUntil('0002') })
    await client.execute(`INSERT INTO users (id, email, display_name) VALUES ('u1', 'a@b.c', 'Luffy')`)
    await client.execute(`INSERT INTO decks (id, user_id, name, raw) VALUES ('d1', 'u1', 'Atraxa', '1 Sol Ring')`)

    await migrate(db, { migrationsFolder: MIGRATIONS })

    const { rows } = await client.execute(`SELECT id, game, raw FROM decks`)
    expect(rows.map(r => ({ ...r }))).toEqual([{ id: 'd1', game: 'mtg', raw: '1 Sol Ring' }])
    const { rows: idx } = await client.execute(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'decks_public_game_idx'`)
    expect(idx).toHaveLength(1)
    client.close()
  })
})
