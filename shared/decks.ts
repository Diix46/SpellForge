/**
 * Guest decks in the browser's localStorage, and their migration.
 *
 * Version 1 (`mtg_decks_v1`) predates One Piece and carries no game. Version 2
 * adds `game`. Reading prefers v2; a v1 list is migrated once, as Magic, and
 * the caller then writes v2 and deletes v1 — never keeping both, or a deck
 * deleted in v2 would come back from v1 on the next load.
 */
import type { GameId } from './game'
import { parseGameId } from './game'

export const GUEST_DECKS_V1 = 'mtg_decks_v1'
export const GUEST_DECKS_V2 = 'prism_decks_v2'

export interface StoredDeck {
  id: string
  name: string
  game: GameId
  raw: string
  source?: string
  createdAt: number
  updatedAt: number
  shareId?: string | null
  public?: boolean
}

function time(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? new Date(v).getTime() : Number.NaN
  return Number.isFinite(n) ? n : 0
}

/**
 * A deck from storage or from the server, or null when it is not one. A
 * missing game means the deck was saved before One Piece existed: Magic.
 */
export function normalizeDeck(value: unknown): StoredDeck | null {
  if (!value || typeof value !== 'object')
    return null
  const d = value as Record<string, unknown>
  if (typeof d.id !== 'string' || !d.id)
    return null
  const deck: StoredDeck = {
    id: d.id,
    name: typeof d.name === 'string' ? d.name : '',
    game: parseGameId(d.game) ?? 'mtg',
    raw: typeof d.raw === 'string' ? d.raw : '',
    createdAt: time(d.createdAt),
    updatedAt: time(d.updatedAt),
  }
  if (typeof d.source === 'string')
    deck.source = d.source
  if (d.shareId !== undefined)
    deck.shareId = typeof d.shareId === 'string' ? d.shareId : null
  if (d.public !== undefined)
    deck.public = !!d.public
  return deck
}

function parseList(json: string | null): StoredDeck[] | null {
  if (json == null)
    return null
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed))
      return []
    return parsed.map(normalizeDeck).filter((d): d is StoredDeck => d !== null)
  }
  catch {
    return []
  }
}

export interface GuestDecks {
  decks: StoredDeck[]
  /** True when the caller must write v2 and delete v1. */
  migrate: boolean
}

export function readGuestDecks(v1: string | null, v2: string | null): GuestDecks {
  const current = parseList(v2)
  if (current)
    return { decks: current, migrate: v1 != null }
  const legacy = parseList(v1)
  return { decks: legacy ?? [], migrate: legacy != null }
}
