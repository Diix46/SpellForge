import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import process from 'node:process'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../db/schema'

// Single configured libSQL connection, reused across requests (server-only).
// Local dev/prod use a file DB (no native build — libSQL ships prebuilt binaries).
// Set DATABASE_URL=libsql://… + DATABASE_AUTH_TOKEN to point at Turso later.
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function useDb() {
  if (_db)
    return _db
  const url = process.env.DATABASE_URL || 'file:./.data/spellforge.db'
  const authToken = process.env.DATABASE_AUTH_TOKEN
  // libSQL won't create the parent directory for a file: URL — ensure it exists.
  if (url.startsWith('file:')) {
    const dir = dirname(url.slice('file:'.length))
    if (dir && !existsSync(dir))
      mkdirSync(dir, { recursive: true })
  }
  const client = createClient(authToken ? { url, authToken } : { url })
  _db = drizzle(client, { schema })
  return _db
}

export { schema }
