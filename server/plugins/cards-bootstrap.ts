import { existsSync, statSync } from 'node:fs'
import process from 'node:process'
import { createClient } from '@libsql/client'
import { MTG_CARDS_DB, MTG_SCHEMA_VERSION, OPTCG_CARDS_DB } from '../utils/cards/db'

// A new install has no card database: build them at boot instead of waiting
// for the nightly refresh. An empty file counts as missing (the server creates
// one when a request opens a database that is not there yet).
// CARDS_REFRESH_ON_BOOT=false turns this off.
const hasCards = (path: string) => existsSync(path) && statSync(path).size > 0

// A release that adds columns ships with a newer schema than the database on
// disk: rebuild now rather than at the nightly refresh. The old database keeps
// serving meanwhile (the queries tolerate it), then the refresh swaps it.
async function mtgSchemaBehind(): Promise<boolean> {
  const db = createClient({ url: `file:${MTG_CARDS_DB}` })
  try {
    const { rows } = await db.execute('SELECT value FROM meta WHERE key = \'schema_version\'')
    return String(rows[0]?.value ?? '') !== MTG_SCHEMA_VERSION
  }
  catch {
    return true
  }
  finally {
    db.close()
  }
}

export default defineNitroPlugin(async () => {
  if (import.meta.dev || process.env.CARDS_REFRESH_ON_BOOT === 'false')
    return
  const missing = !hasCards(MTG_CARDS_DB) || !hasCards(OPTCG_CARDS_DB)
  const behind = !missing && await mtgSchemaBehind()
  if (!missing && !behind)
    return
  console.warn(`[cards:refresh] card database ${missing ? 'missing' : 'on an older schema'}, building it now`)
  runTask('cards:refresh').catch(err => console.error('[cards:refresh] boot run failed', err))
})
