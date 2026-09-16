/**
 * One Piece card search against the local database (scripts/ingest-optcg.mjs).
 *
 * The catalogue is small — 2 785 card numbers — so every query here is a few
 * milliseconds without further tricks. Two precomputed tables do the work
 * Magic's best_printings does: `op_numbers` holds one row per card number with
 * what the filters and the rules need, and `op_best` names the printing to show
 * per site language, English filling the numbers French does not cover yet.
 */
import type { InValue } from '@libsql/client'
import type { OptcgCategory, OptcgColor } from '../../../shared/optcg/rules'
import type { OptcgSortOrder } from '../../../shared/optcg/types'
import { MIN_LEGAL_BLOCK, OPTCG_COLOR_BIT } from '../../../shared/optcg/rules'
import { fold, ftsPhrase } from './text'

export const OPTCG_PAGE_SIZE = 120

export interface OptcgBrowseFilters {
  text?: string
  category?: OptcgCategory | ''
  /** Cards showing at least one of these colours (the colour chips). */
  colors?: OptcgColor[]
  /**
   * The deck's Leader colours: every colour of a card must be one of them, the
   * rule a deck is built under. Null or absent means no Leader constraint.
   */
  leaderColors?: OptcgColor[] | null
  costMin?: number | null
  costMax?: number | null
  /** Set code as printed, "OP-01". */
  set?: string
  /** Standard format only: not banned and not rotated. */
  legalOnly?: boolean
  /** Only cards with a counter value (the "can defend" filter). */
  counterOnly?: boolean
}

export function colorMask(colors: readonly OptcgColor[] | null | undefined): number {
  let m = 0
  for (const c of colors ?? []) m |= OPTCG_COLOR_BIT[c] ?? 0
  return m
}

/** Every column a card needs, from the three tables joined as n, c. */
export const OPTCG_CARD_COLUMNS = `
  n.card_number, n.category, n.colors, n.cost, n.life, n.power, n.counter,
  n.set_code, n.block, n.is_banned, n.variants,
  c.id, c.lang AS text_lang, c.name, c.rarity, c.attributes, c.types,
  c.effect, c.trigger_text, c.img_version`

const BEST_JOIN = `
  JOIN op_best b ON b.card_number = n.card_number AND b.lang = ?
  JOIN op_cards c ON c.id = b.id AND c.lang = b.row_lang`

const ORDER_BY: Record<OptcgSortOrder, string> = {
  number: 'n.card_number',
  cost: 'n.cost IS NULL, n.cost, n.card_number',
  power: 'n.power IS NULL, n.power DESC, n.card_number',
  name: 'c.name COLLATE NOCASE, n.card_number',
}

/** "OP01", "op01-01", "ST13-002": the start of a card number, typed as such. */
const NUMBER_PREFIX = /^[a-z]{1,3}\d{1,2}(?:-\d{0,3})?$/i

function buildWhere(filters: OptcgBrowseFilters) {
  const clauses: string[] = []
  const args: InValue[] = []

  const text = filters.text?.trim()
  if (text) {
    const phrase = ftsPhrase(text)
    const byText = phrase
      ? `n.card_number IN (SELECT c2.card_number FROM op_search s
                             JOIN op_cards c2 ON c2.id = s.id AND c2.lang = s.lang
                            WHERE op_search MATCH ?)`
      : null
    if (phrase)
      args.push(`${phrase}*`)
    if (NUMBER_PREFIX.test(text)) {
      clauses.push(byText ? `(${byText} OR n.card_number LIKE ?)` : 'n.card_number LIKE ?')
      args.push(`${text.toUpperCase()}%`)
    }
    else if (byText) {
      clauses.push(byText)
    }
  }

  if (filters.category) {
    clauses.push('n.category = ?')
    args.push(filters.category)
  }

  const any = colorMask(filters.colors)
  if (any) {
    clauses.push('(n.color_mask & ?) != 0')
    args.push(any)
  }

  if (filters.leaderColors) {
    // Leaders are chosen, not added: a Leader constraint means "deck cards".
    clauses.push(`n.category != 'Leader'`, '(n.color_mask & ~?) = 0')
    args.push(colorMask(filters.leaderColors))
  }

  if (filters.costMin != null) {
    clauses.push('n.cost >= ?')
    args.push(filters.costMin)
  }
  if (filters.costMax != null) {
    clauses.push('n.cost <= ?')
    args.push(filters.costMax)
  }

  if (filters.set) {
    clauses.push('n.set_code = ?')
    args.push(filters.set)
  }

  if (filters.legalOnly) {
    clauses.push('n.is_banned = 0', '(n.block IS NULL OR n.block >= ?)')
    args.push(MIN_LEGAL_BLOCK)
  }

  if (filters.counterOnly)
    clauses.push('n.counter > 0')

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', args }
}

export function buildOptcgBrowseQuery(filters: OptcgBrowseFilters, lang: string, order: OptcgSortOrder = 'number', page = 1) {
  const { where, args } = buildWhere(filters)
  return {
    // `lang` belongs to the join, which comes before the WHERE clause.
    sql: `SELECT ${OPTCG_CARD_COLUMNS}
            FROM op_numbers n ${BEST_JOIN}
           ${where}
           ORDER BY ${ORDER_BY[order] ?? ORDER_BY.number}
           LIMIT ? OFFSET ?`,
    args: [lang, ...args, OPTCG_PAGE_SIZE, Math.max(0, (page - 1) * OPTCG_PAGE_SIZE)] as InValue[],
    countSql: `SELECT COUNT(*) AS total FROM op_numbers n ${where}`,
    countArgs: args,
  }
}

/** Several card numbers at once, each through its display printing. */
export function buildOptcgByNumberQuery(numbers: readonly string[], lang: string) {
  return {
    sql: `SELECT ${OPTCG_CARD_COLUMNS}
            FROM op_numbers n ${BEST_JOIN}
           WHERE n.card_number IN (${numbers.map(() => '?').join(',')})`,
    args: [lang, ...numbers] as InValue[],
  }
}

/**
 * Pinned arts: the exact printings a deck asked for, in the site language when
 * that art exists in it, in the other one otherwise.
 */
export function buildOptcgByIdQuery(ids: readonly string[], lang: string) {
  return {
    sql: `SELECT ${OPTCG_CARD_COLUMNS}
            FROM op_cards c
            JOIN op_numbers n ON n.card_number = c.card_number
           WHERE c.id IN (${ids.map(() => '?').join(',')})
           ORDER BY (c.lang = ?) DESC`,
    args: [...ids, lang] as InValue[],
  }
}

/**
 * Name suggestions. One Piece names are not unique — there are dozens of
 * "Monkey.D.Luffy" — so this returns cards, not names: the player picks one.
 * Names that start with the text come first, then names containing a word that
 * does, then numbers that start with it.
 */
export function buildOptcgAutocompleteQuery(text: string, lang: string, limit = 20) {
  const start = fold(text)
  const phrase = ftsPhrase(text)
  const upper = text.trim().toUpperCase()
  return {
    sql: `SELECT ${OPTCG_CARD_COLUMNS}, (
              CASE WHEN c.name_folded LIKE ? ESCAPE '\\' THEN 0
                   WHEN n.card_number LIKE ? THEN 2
                   ELSE 1 END) AS grp
            FROM op_numbers n ${BEST_JOIN}
           WHERE n.card_number LIKE ?
              ${phrase
                ? `OR n.card_number IN (SELECT c2.card_number FROM op_search s
                             JOIN op_cards c2 ON c2.id = s.id AND c2.lang = s.lang
                            WHERE op_search MATCH ?)`
                : ''}
           ORDER BY grp, c.name COLLATE NOCASE, n.card_number
           LIMIT ?`,
    args: [
      `${start.replace(/[\\%_]/g, ch => `\\${ch}`)}%`,
      `${upper}%`,
      lang,
      `${upper}%`,
      ...(phrase ? [`name_folded : ${phrase}*`] : []),
      limit,
    ] as InValue[],
  }
}

/** Every art of one card number, site language first. */
export function buildOptcgPrintsQuery(number: string, lang: string) {
  return {
    sql: `SELECT id, lang, rarity, set_code, img_version FROM (
            SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY (c.lang = ?) DESC) AS rn
              FROM op_cards c WHERE c.card_number = ?)
           WHERE rn = 1
           ORDER BY (id = ?) DESC, id`,
    args: [lang, number, number] as InValue[],
  }
}
