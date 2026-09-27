/**
 * The generic engine's request parameters. Same stance as the other games:
 * a value outside its pattern means "no filter", never an error — except the
 * game itself, which must be one of the engine's.
 */
import type { H3Event } from 'h3'
import type { TcgGameId, TcgSortOrder } from '../../../shared/tcg/types'
import type { TcgFilters } from './query'
import { isTcgGame } from '../../../shared/tcg/types'

export function tcgGame(event: H3Event): TcgGameId {
  const game = getRouterParam(event, 'game')
  if (!isTcgGame(game))
    throw createError({ statusCode: 404, statusMessage: 'Unknown game' })
  return game
}

function str(v: unknown, max = 60): string {
  const s = typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : ''
  return s.trim().slice(0, max)
}

/** Words and codes: letters, digits, spaces and a little punctuation. */
const WORD = /^[\p{L}\d .'’\-]{1,40}$/u
function word(v: unknown) {
  const s = str(v)
  return WORD.test(s) ? s : ''
}
const ORDERS = new Set<string>(['recent', 'name', 'number', 'price'])

export function tcgLang(v: unknown): 'fr' | 'en' {
  return str(v) === 'fr' ? 'fr' : 'en'
}

export function parseTcgBrowse(q: Record<string, unknown>) {
  const page = Number.parseInt(str(q.page), 10)
  const order = str(q.order)
  const filters: TcgFilters = {
    text: str(q.text, 200),
    set: word(q.set),
    category: word(q.category),
    subtype: word(q.subtype),
    rarity: word(q.rarity),
    types: str(q.types, 200).split(',').map(s => s.trim()).filter(s => WORD.test(s)).slice(0, 12),
    format: word(q.format),
  }
  return {
    filters,
    lang: tcgLang(q.lang),
    order: (ORDERS.has(order) ? order : 'recent') as TcgSortOrder,
    page: Number.isFinite(page) ? Math.min(Math.max(page, 1), 1000) : 1,
  }
}

/** A printing id: "sv03.5-006", "89631139", "ogn-001". */
export const TCG_ID = /^[\w.\-]{1,40}$/
