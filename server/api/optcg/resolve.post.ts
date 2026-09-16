/**
 * Resolve a One Piece decklist: `{ lang, entries: [{ number, id? }] }` →
 * `{ cards }`, in input order, `null` for an unknown number.
 */
import type { OptcgEntryRef } from '../../utils/cards/optcg-resolve'
import { useOptcgCardsDb } from '../../utils/cards/db'
import { OPTCG_ID, OPTCG_NUMBER, resolveOptcgEntries } from '../../utils/cards/optcg-resolve'

// A deck is 51 cards; room for a pasted list with duplicates and a sideboard.
const MAX_ENTRIES = 120

export default defineEventHandler(async (event) => {
  const body = await readBody<{ lang?: unknown, entries?: unknown }>(event)
  const lang = body?.lang === 'fr' ? 'fr' : 'en'
  const raw = Array.isArray(body?.entries) ? body.entries : null
  if (!raw || raw.length > MAX_ENTRIES)
    throw createError({ statusCode: 400, statusMessage: `entries must be an array of at most ${MAX_ENTRIES}` })

  const entries: OptcgEntryRef[] = []
  for (const e of raw) {
    const number = typeof e?.number === 'string' ? e.number.trim().toUpperCase() : ''
    const id = typeof e?.id === 'string' ? e.id.trim() : undefined
    // Reject the whole request on a malformed entry: the client builds these,
    // so a bad one is a bug to surface, not a card to skip.
    if (!OPTCG_NUMBER.test(number) || (id !== undefined && !OPTCG_ID.test(id)))
      throw createError({ statusCode: 400, statusMessage: 'Invalid card entry' })
    entries.push(id ? { number, id } : { number })
  }

  return { cards: await resolveOptcgEntries(useOptcgCardsDb(), entries, lang) }
})
