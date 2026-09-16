/**
 * Parse `/api/optcg/browse` query parameters. Same stance as browse-params.ts:
 * every value is checked against an allowlist or a range, and anything
 * unexpected means "no filter" rather than an error.
 */
import type { OptcgCategory, OptcgColor } from '../../../shared/optcg/rules'
import type { OptcgSortOrder } from '../../../shared/optcg/types'
import type { OptcgBrowseFilters } from './optcg-query'
import { OPTCG_COLORS } from '../../../shared/optcg/rules'

const CATEGORIES = new Set<string>(['Leader', 'Character', 'Event', 'Stage'])
const ORDERS = new Set<string>(['number', 'cost', 'power', 'name'])
const COLORS = new Set<string>(OPTCG_COLORS)
const SET_CODE = /^[A-Z]{1,3}-\d{2}$|^P$/

function str(v: unknown): string {
  if (typeof v === 'string')
    return v
  return Array.isArray(v) && typeof v[0] === 'string' ? v[0] : ''
}

function colorList(v: string): OptcgColor[] {
  return [...new Set(v.split(',').map(s => s.trim()).filter(c => COLORS.has(c)))] as OptcgColor[]
}

function bounded(v: string, max: number): number | null {
  if (v.trim() === '')
    return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null
}

export interface OptcgBrowseParams {
  filters: OptcgBrowseFilters
  lang: 'fr' | 'en'
  order: OptcgSortOrder
  page: number
}

export function parseOptcgBrowseQuery(q: Record<string, unknown>): OptcgBrowseParams {
  const category = str(q.category)
  const order = str(q.order)
  const set = str(q.set).toUpperCase()
  const page = Number.parseInt(str(q.page), 10)
  return {
    filters: {
      text: str(q.text).slice(0, 200),
      category: CATEGORIES.has(category) ? category as OptcgCategory : '',
      colors: colorList(str(q.colors)),
      // Absent: no Leader chosen yet. Present: the deck's Leader colours.
      leaderColors: Object.hasOwn(q, 'leader') ? colorList(str(q.leader)) : null,
      costMin: bounded(str(q.costMin), 20),
      costMax: bounded(str(q.costMax), 20),
      set: SET_CODE.test(set) ? set : '',
      legalOnly: ['1', 'true'].includes(str(q.legal)),
      counterOnly: ['1', 'true'].includes(str(q.counter)),
    },
    lang: str(q.lang) === 'fr' ? 'fr' : 'en',
    order: ORDERS.has(order) ? order as OptcgSortOrder : 'number',
    page: Number.isFinite(page) ? Math.min(Math.max(page, 1), 1000) : 1,
  }
}
