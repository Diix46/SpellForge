/**
 * Resolve a deck's entries to displayable cards, from the local database.
 *
 * One request for the whole deck, replacing the per-card client cascade that
 * made up to five network calls per card. Not cached at the route level: the
 * lookups are indexed and fast, and the answer changes whenever the card
 * database is refreshed.
 */
import { useMtgCardsDb } from '../../utils/cards/db'
import { resolveEntries } from '../../utils/cards/mtg-resolve'

// A Commander deck is 100 cards; leave room for a sideboard and maybeboard.
const MAX_ENTRIES = 250

interface EntryInput {
  name?: unknown
  set?: unknown
  collectorNumber?: unknown
}

function isValid(e: EntryInput | null | undefined): boolean {
  return !!e
    && typeof e.name === 'string' && e.name.trim().length > 0
    && (e.set == null || typeof e.set === 'string')
    && (e.collectorNumber == null || typeof e.collectorNumber === 'string')
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ entries?: EntryInput[], lang?: unknown }>(event)
  const raw = Array.isArray(body?.entries) ? body.entries : []

  if (raw.length > MAX_ENTRIES)
    throw createError({ statusCode: 413, statusMessage: `Too many entries (max ${MAX_ENTRIES})` })
  // Reject rather than filter: the client reads results back by index, so
  // dropping one entry would silently shift every card after it.
  if (!raw.every(isValid))
    throw createError({ statusCode: 400, statusMessage: 'Invalid entry' })

  const entries = raw.map(e => ({
    name: (e.name as string).trim(),
    set: (e.set as string | undefined) ?? null,
    collectorNumber: (e.collectorNumber as string | undefined) ?? null,
  }))
  const lang = body?.lang === 'fr' ? 'fr' : 'en'

  return { cards: await resolveEntries(useMtgCardsDb(), entries, lang) }
})
