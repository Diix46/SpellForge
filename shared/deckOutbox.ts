/**
 * Deck writes waiting for the server, for a signed-in account.
 *
 * Only the latest write per deck matters: a newer snapshot replaces an older
 * one, and a deletion replaces both. The outbox is kept in localStorage, so a
 * write that could not reach the server survives a reload and is sent again.
 * Each entry carries a sequence number: a success only clears the entry it was
 * sent for, never a newer one queued meanwhile. Pure, for the tests.
 */
import type { StoredDeck } from './decks'
import { normalizeDeck } from './decks'

export type OutboxEntry
  = | { kind: 'upsert', seq: number, deck: StoredDeck }
    | { kind: 'delete', seq: number, id: string }

export type Outbox = Record<string, OutboxEntry>

export const OUTBOX_KEY = 'prism_outbox_v1'

export const outboxKey = (userId: string) => `${OUTBOX_KEY}:${userId}`

export function queueUpsert(outbox: Outbox, deck: StoredDeck, seq: number): Outbox {
  return { ...outbox, [deck.id]: { kind: 'upsert', seq, deck } }
}

export function queueDelete(outbox: Outbox, id: string, seq: number): Outbox {
  return { ...outbox, [id]: { kind: 'delete', seq, id } }
}

/** Clears an entry once its write succeeded, unless a newer one replaced it. */
export function settle(outbox: Outbox, id: string, seq: number): Outbox {
  if (outbox[id]?.seq !== seq)
    return outbox
  const { [id]: _done, ...rest } = outbox
  return rest
}

/** Server decks with the pending writes applied on top. */
export function applyOutbox(server: readonly StoredDeck[], outbox: Outbox): StoredDeck[] {
  const byId = new Map(server.map(d => [d.id, d]))
  for (const entry of Object.values(outbox)) {
    if (entry.kind === 'delete')
      byId.delete(entry.id)
    else byId.set(entry.deck.id, entry.deck)
  }
  return [...byId.values()]
}

export function parseOutbox(json: string | null): Outbox {
  if (!json)
    return {}
  try {
    const raw = JSON.parse(json) as Record<string, unknown>
    const out: Outbox = {}
    for (const [id, value] of Object.entries(raw ?? {})) {
      const e = value as { kind?: unknown, seq?: unknown, deck?: unknown }
      const seq = typeof e?.seq === 'number' ? e.seq : 0
      if (e?.kind === 'delete') {
        out[id] = { kind: 'delete', seq, id }
      }
      else if (e?.kind === 'upsert') {
        const deck = normalizeDeck(e.deck)
        if (deck && deck.id === id)
          out[id] = { kind: 'upsert', seq, deck }
      }
    }
    return out
  }
  catch {
    return {}
  }
}

/** The highest sequence number in use, so a reload keeps counting upward. */
export function lastSeq(outbox: Outbox): number {
  return Object.values(outbox).reduce((max, e) => Math.max(max, e.seq), 0)
}
