/**
 * The printings of many cards at once — a whole deck — for the deck-wide
 * illustration actions and the preview grid's ‹ › browsing. One request instead
 * of one per card; each lookup is an indexed query on the local database.
 */
import type { PrintOption } from '../../../shared/mtg/prints'
import { requireAppUser } from '../../utils/appUser'
import { useMtgCardsDb } from '../../utils/cards/db'
import { listPrints } from '../../utils/cards/mtg-prints'

// A Commander deck is 100 cards; leave room for a sideboard and maybeboard.
const MAX_NAMES = 250

export default defineEventHandler(async (event): Promise<{ prints: Record<string, PrintOption[]> }> => {
  // Choosing artworks is for members (useMembersOnly).
  await requireAppUser(event)
  const body = await readBody<{ names?: unknown, lang?: unknown, all?: unknown }>(event)
  const raw = Array.isArray(body?.names) ? body.names : []
  if (raw.length > MAX_NAMES)
    throw createError({ statusCode: 413, statusMessage: `Too many names (max ${MAX_NAMES})` })
  const names = [...new Set(raw
    .filter((n): n is string => typeof n === 'string')
    .map(n => n.trim().slice(0, 160))
    .filter(Boolean))]
  const lang = body?.lang === 'fr' ? 'fr' : 'en'
  // The English printings too: the "all in English" action needs them.
  const all = body?.all === true

  const db = useMtgCardsDb()
  const prints: Record<string, PrintOption[]> = {}
  for (const name of names)
    prints[name] = await listPrints(db, name, lang, all)
  return { prints }
})
