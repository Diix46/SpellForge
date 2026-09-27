/**
 * The generic engine's card databases, one per game (scripts/tcg/schema.mjs).
 * Rebuilt in place by their ingest scripts, read only here.
 */
import type { Client } from '@libsql/client'
import type { TcgGameId } from '../../../shared/tcg/types'
import process from 'node:process'
import { createClient } from '@libsql/client'
import { TCG_GAME_IDS } from '../../../shared/tcg/types'

/** Where a game's database lives: POKEMON_CARDS_DB, or .data/cards-pokemon.db. */
export function tcgDbPath(game: TcgGameId): string {
  return process.env[`${game.toUpperCase()}_CARDS_DB`] || `.data/cards-${game}.db`
}

const clients = new Map<TcgGameId, Client>()

export function useTcgDb(game: TcgGameId): Client {
  let db = clients.get(game)
  if (!db) {
    db = createClient({ url: `file:${tcgDbPath(game)}` })
    clients.set(game, db)
  }
  return db
}

/** The next request opens the file an ingest just swapped in; reads under way finish on the old one. */
export function reopenTcgDbs(): void {
  const old = [...clients.values()]
  clients.clear()
  setTimeout(() => old.forEach(c => c.close()), 30_000).unref()
}

/** Every game's ingest script, for the nightly refresh. */
export const TCG_REFRESH_STEPS = TCG_GAME_IDS.map(game => ({ name: game, script: `scripts/ingest-${game}.mjs` }))
