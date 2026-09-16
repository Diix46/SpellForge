import type { Client } from '@libsql/client'
import { existsSync } from 'node:fs'
import { createClient } from '@libsql/client'

/** Built by `npm run cards:ingest`; integration suites skip without it. */
export const CARD_DB = '.data/cards-mtg.db'

/**
 * The card database, or an empty in-memory one when it is not built.
 *
 * Vitest still runs a skipped suite's body to collect its tests, so opening
 * the missing file there made a fresh clone fail instead of skip.
 */
export function openCardDb(): Client {
  return createClient({ url: existsSync(CARD_DB) ? `file:${CARD_DB}` : ':memory:' })
}
