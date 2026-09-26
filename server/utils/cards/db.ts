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

export const MTG_CARDS_DB = process.env.MTG_CARDS_DB || '.data/cards-mtg.db'

/**
 * The Magic schema this app reads — SCHEMA_VERSION in scripts/ingest-mtg.mjs
 * (a test holds the two together). An older database is rebuilt at boot.
 */
export const MTG_SCHEMA_VERSION = '4'
export const OPTCG_CARDS_DB = process.env.OPTCG_CARDS_DB || '.data/cards-optcg.db'

let mtg: Client | null = null
let optcg: Client | null = null

// Reads already running when the databases are reopened finish on the old
// handles, which close after this delay.
const CLOSE_DELAY_MS = 30_000

export function useMtgCardsDb(): Client {
  mtg ??= createClient({ url: `file:${MTG_CARDS_DB}` })
  return mtg
}

/**
 * The ingest swaps a database file with an atomic rename(); a client opened
 * before keeps reading the previous file. The scheduled refresh calls this
 * after a rebuild so the next request opens the new one.
 */
export function reopenCardDbs(): void {
  const old = [mtg, optcg]
  mtg = null
  optcg = null
  setTimeout(() => old.forEach(c => c?.close()), CLOSE_DELAY_MS).unref()
}

/** The One Piece card database — same lifecycle as the Magic one. */
export function useOptcgCardsDb(): Client {
  optcg ??= createClient({ url: `file:${OPTCG_CARDS_DB}` })
  return optcg
}
