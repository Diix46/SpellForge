import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterAll, describe, expect, it } from 'vitest'
import * as schema from '../server/db/schema'
import { listedDeckUrls } from '../server/utils/sitemap-decks'

const dir = mkdtempSync(join(tmpdir(), 'prism-sitemap-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('listedDeckUrls', () => {
  it('lists public decks only, in their universe, never a private share link', async () => {
    const client = createClient({ url: `file:${join(dir, 'app.db')}` })
    const db = drizzle(client, { schema })
    await migrate(db, { migrationsFolder: 'server/db/migrations' })
    await client.execute(`INSERT INTO users (id, email, display_name) VALUES ('u1', 'a@b.c', 'Nami')`)
    await client.executeMultiple(`
      INSERT INTO decks (id, user_id, name, game, share_id, public, updated_at) VALUES ('d1', 'u1', 'Listed', 'optcg', 'pub-op', 1, 2000);
      INSERT INTO decks (id, user_id, name, game, share_id, public, updated_at) VALUES ('d2', 'u1', 'Link only', 'mtg', 'secret', 0, 3000);
      INSERT INTO decks (id, user_id, name, game, share_id, public, updated_at) VALUES ('d3', 'u1', 'Listed too', 'mtg', 'pub-mtg', 1, 1000);
      INSERT INTO decks (id, user_id, name, game, share_id, public, updated_at) VALUES ('d4', 'u1', 'Private', 'mtg', NULL, 0, 4000);
    `)

    const urls = await listedDeckUrls(db, 10)
    expect(urls.map(u => u.path)).toEqual(['/one-piece/shared/pub-op', '/magic/shared/pub-mtg'])
    expect(urls.some(u => u.path.includes('secret'))).toBe(false)
    expect(urls[0]!.lastmod?.getTime()).toBe(2000)
    client.close()
  })
})
