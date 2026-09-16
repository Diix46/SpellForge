/**
 * Access to the local card databases.
 *
 * Deliberately separate from `useDb()`: that one holds user data and runs
 * migrations, while these are rebuildable caches the ingest scripts replace
 * wholesale. The app only ever reads them.
 */
import type { Client } from '@libsql/client'
import process from 'node:process'
import { createClient } from '@libsql/client'

let mtg: Client | null = null

export function useMtgCardsDb(): Client {
  // The ingest swaps the file with an atomic rename(). A client opened before
  // that keeps reading the previous file until the process restarts — fine for
  // a manual refresh, to revisit once ingestion runs as a scheduled task.
  mtg ??= createClient({ url: `file:${process.env.MTG_CARDS_DB || '.data/cards-mtg.db'}` })
  return mtg
}
