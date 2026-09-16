/**
 * Resolve One Piece decklist entries to cards, in one round trip per kind.
 */
import type { Client } from '@libsql/client'
import type { OptcgCard } from '../../../shared/optcg/types'
import { buildOptcgByIdQuery, buildOptcgByNumberQuery } from './optcg-query'
import { toOptcgCard } from './optcg-shape'

export interface OptcgEntryRef {
  /** Card number, "OP01-016". */
  number: string
  /** A pinned art of that number, "OP01-016_p1". */
  id?: string
}

/** "OP01-016", "P-001", "PRB01-004". */
export const OPTCG_NUMBER = /^[A-Z]{1,3}\d{0,2}-\d{3}$/
/** A number, optionally followed by an art or reprint suffix. */
export const OPTCG_ID = /^[A-Z]{1,3}\d{0,2}-\d{3}(?:_[pr]\d{1,2})?$/

/**
 * Cards in input order, `null` where a number is unknown. A pinned art that
 * does not exist, or does not belong to its number, falls back to the number's
 * usual art rather than failing the deck.
 */
export async function resolveOptcgEntries(db: Client, entries: readonly OptcgEntryRef[], lang: string): Promise<(OptcgCard | null)[]> {
  const numbers = [...new Set(entries.map(e => e.number))]
  const pinned = [...new Set(entries
    .filter(e => e.id && e.id !== e.number && e.id.startsWith(`${e.number}_`))
    .map(e => e.id!))]

  const byNumber = new Map<string, OptcgCard>()
  const byId = new Map<string, OptcgCard>()

  if (numbers.length) {
    const { rows } = await db.execute(buildOptcgByNumberQuery(numbers, lang))
    for (const r of rows) byNumber.set(String(r.card_number), toOptcgCard(r))
  }
  if (pinned.length) {
    const { rows } = await db.execute(buildOptcgByIdQuery(pinned, lang))
    // Rows come site language first: keep the first one per art.
    for (const r of rows) {
      const card = toOptcgCard(r)
      if (!byId.has(card.id))
        byId.set(card.id, card)
    }
  }

  return entries.map(e => (e.id ? byId.get(e.id) : undefined) ?? byNumber.get(e.number) ?? null)
}
