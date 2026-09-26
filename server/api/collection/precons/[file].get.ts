import type { PreconCard } from '../../../../shared/collection-decks'
import { usePreconsDb } from '../../../utils/cards/db'

// The cards of one preconstructed deck, in their exact printings.
export default defineEventHandler(async (event): Promise<{ cards: PreconCard[] }> => {
  const file = String(getRouterParam(event, 'file') ?? '').slice(0, 120)
  const { rows } = await usePreconsDb().execute({
    sql: `SELECT section, count, name, set_code, number, scryfall_id, foil FROM precon_cards WHERE file = ?
          ORDER BY section = 'commander' DESC, name`,
    args: [file],
  })
  if (!rows.length)
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Deck introuvable' })
  return {
    cards: rows.map(r => ({
      section: String(r.section) as PreconCard['section'],
      count: Number(r.count),
      name: String(r.name),
      set: String(r.set_code),
      number: String(r.number),
      scryfallId: r.scryfall_id == null ? null : String(r.scryfall_id),
      foil: Number(r.foil) === 1,
    })),
  }
})
