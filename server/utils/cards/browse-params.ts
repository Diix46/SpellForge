/**
 * Parse `/api/cards/browse` query parameters into search filters.
 *
 * This is the boundary where arbitrary URL input meets the SQL builder, so
 * every value is checked against an allowlist or a bounded range. Anything
 * unexpected falls back to "no filter" rather than failing — a stale or
 * hand-edited URL should still return results.
 */
import type { CardTypeFilter, ManaColor, QueryContext, SearchFilters, SortOrder } from './mtg-query'
import { THEMES } from './mtg-query'

const COLORS = new Set<string>(['W', 'U', 'B', 'R', 'G'])
const TYPES = new Set<string>(['creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'land'])
const ORDERS = new Set<string>(['edhrec', 'eur', 'name', 'cmc'])
const MAX_PAGE = 1000

export interface BrowseParams {
  filters: SearchFilters
  ctx: QueryContext
  order: SortOrder
  page: number
}

/** A query value may arrive as a string or, when repeated, as an array. */
function str(v: unknown): string {
  if (typeof v === 'string')
    return v
  return Array.isArray(v) && typeof v[0] === 'string' ? v[0] : ''
}

function colorList(v: string): ManaColor[] {
  return [...new Set(v.toUpperCase().split('').filter(c => COLORS.has(c)))] as ManaColor[]
}

function bounded(v: string, max: number): number | null {
  if (v.trim() === '')
    return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null
}

export function parseBrowseQuery(q: Record<string, unknown>): BrowseParams {
  const type = str(q.type)
  const order = str(q.order)
  const page = Number.parseInt(str(q.page), 10)

  return {
    filters: {
      // Room for a query written in Scryfall syntax, which runs longer than a name.
      text: str(q.text).slice(0, 500),
      // Object.hasOwn, not `in`: `'toString' in THEMES` is true via the prototype.
      themes: str(q.themes).split(',').map(s => s.trim()).filter(k => k && Object.hasOwn(THEMES, k)),
      type: TYPES.has(type) ? type as CardTypeFilter : '',
      subtype: str(q.subtype).trim().slice(0, 60),
      colors: colorList(str(q.colors)),
      maxCmc: bounded(str(q.maxCmc), 20),
      maxPrice: bounded(str(q.maxPrice), 100_000),
      commanderOnly: ['1', 'true'].includes(str(q.commanderOnly)),
    },
    ctx: {
      // Absent means "no identity constraint"; present but empty means the
      // commander is colourless — a real, strict filter. The two must differ.
      identity: Object.hasOwn(q, 'identity') ? colorList(str(q.identity)) : null,
      lang: str(q.lang) === 'fr' ? 'fr' : 'en',
    },
    order: ORDERS.has(order) ? order as SortOrder : 'edhrec',
    page: Number.isFinite(page) ? Math.min(Math.max(page, 1), MAX_PAGE) : 1,
  }
}
