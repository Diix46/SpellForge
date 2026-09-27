/**
 * Card search for the generic engine's games, against their local database
 * (scripts/tcg/schema.mjs). A printing shows in the site's language when it
 * exists in it, in the other one otherwise.
 */
import type { InValue, Row } from '@libsql/client'
import type { TcgCard, TcgFinish, TcgGameId, TcgSet, TcgSortOrder } from '../../../shared/tcg/types'
import { FINISH_BIT } from '../../../shared/tcg/types'
import { fold, ftsPhrase } from '../cards/text'

export const TCG_PAGE_SIZE = 120

export interface TcgFilters {
  text?: string
  set?: string
  category?: string
  subtype?: string
  /** Cards showing at least one of these types. */
  types?: string[]
  rarity?: string
  /** Legal in this format. */
  format?: string
}

/** Where each game's images come from; served through /api/images/tcg (utils/tcg/images). */
export const IMAGE_ORIGIN: Record<TcgGameId, string> = {
  pokemon: 'https://assets.tcgdex.net/',
}

/** An upstream image URL as the app serves it: from its own cache. */
export function tcgImageUrl(game: TcgGameId, url: unknown): string | null {
  if (typeof url !== 'string' || !url)
    return null
  const origin = IMAGE_ORIGIN[game]
  return url.startsWith(origin) ? `/api/images/tcg/${game}/${url.slice(origin.length)}` : url
}

export const CARD_COLUMNS = `
  c.id, c.lang, c.card_key, c.name, c.name_en, c.number, c.set_code, c.rarity, c.category,
  c.subtype, c.types, c.stats, c.text, c.image, c.thumb, c.finishes, c.price_eur,
  c.price_eur_foil, c.regulation, c.legal, c.banned, c.extra, s.name AS set_name`

/** The printing shown per id: the site language's row, else the other one. */
const SHOWN = `(c.lang = ? OR NOT EXISTS (SELECT 1 FROM cards o WHERE o.id = c.id AND o.lang = ?))`
const SET_JOIN = 'LEFT JOIN sets s ON s.code = c.set_code AND s.lang = c.lang'

const NUMBER_ORDER = 'CAST(c.number AS INTEGER), c.number'
// Printings without a scan yet come after the others, whatever the order.
const ORDER_BY: Record<TcgSortOrder, string> = {
  recent: `c.image IS NULL, s.released DESC, c.set_code, ${NUMBER_ORDER}`,
  name: `c.image IS NULL, c.name COLLATE NOCASE, s.released DESC`,
  number: `c.set_code, ${NUMBER_ORDER}`,
  price: `c.price_eur IS NULL, c.price_eur DESC`,
}

/** "sv03.5-006", "sv03.5-0": a printing id, typed as such. */
const ID_PREFIX = /^[a-z][\w.]*-\w*$/i

function where(filters: TcgFilters): { clauses: string[], args: InValue[] } {
  const clauses: string[] = []
  const args: InValue[] = []
  const text = filters.text?.trim()
  if (text) {
    const phrase = ftsPhrase(text)
    const byText = phrase ? 'c.id IN (SELECT id FROM card_search WHERE card_search MATCH ?)' : null
    if (phrase)
      args.push(`${phrase}*`)
    if (ID_PREFIX.test(text)) {
      clauses.push(byText ? `(${byText} OR c.id LIKE ?)` : 'c.id LIKE ?')
      args.push(`${text.toLowerCase()}%`)
    }
    else if (byText) {
      clauses.push(byText)
    }
  }
  const eq = (column: string, value: string | undefined) => {
    if (value) {
      clauses.push(`${column} = ?`)
      args.push(value)
    }
  }
  eq('c.set_code', filters.set)
  eq('c.category', filters.category)
  eq('c.subtype', filters.subtype)
  eq('c.rarity', filters.rarity)
  if (filters.types?.length) {
    clauses.push(`EXISTS (SELECT 1 FROM json_each(c.types) t WHERE t.value IN (${filters.types.map(() => '?').join(',')}))`)
    args.push(...filters.types)
  }
  if (filters.format) {
    clauses.push('c.banned = 0', 'EXISTS (SELECT 1 FROM json_each(c.legal) f WHERE f.value = ?)')
    args.push(filters.format)
  }
  return { clauses, args }
}

export function buildBrowseQuery(filters: TcgFilters, lang: string, order: TcgSortOrder = 'recent', page = 1) {
  const w = where(filters)
  const clause = `WHERE ${[SHOWN, ...w.clauses].join(' AND ')}`
  return {
    sql: `SELECT ${CARD_COLUMNS} FROM cards c ${SET_JOIN} ${clause}
           ORDER BY ${ORDER_BY[order] ?? ORDER_BY.recent}
           LIMIT ? OFFSET ?`,
    args: [lang, lang, ...w.args, TCG_PAGE_SIZE, Math.max(0, (page - 1) * TCG_PAGE_SIZE)] as InValue[],
    countSql: `SELECT COUNT(*) AS total FROM cards c ${clause}`,
    countArgs: [lang, lang, ...w.args] as InValue[],
  }
}

/** Printings by id, each in the site language when it has it. */
export function buildByIdQuery(ids: readonly string[], lang: string) {
  return {
    sql: `SELECT ${CARD_COLUMNS} FROM cards c ${SET_JOIN}
           WHERE c.id IN (${ids.map(() => '?').join(',')}) AND ${SHOWN}`,
    args: [...ids, lang, lang] as InValue[],
  }
}

/** Names as typed, either language: names that start with it first, newest printing each. */
export function buildAutocompleteQuery(text: string, lang: string, limit = 12) {
  const phrase = ftsPhrase(text)
  const start = `${fold(text).replace(/[\\%_]/g, ch => `\\${ch}`)}%`
  return {
    sql: `SELECT * FROM (
            SELECT ${CARD_COLUMNS},
                   ROW_NUMBER() OVER (PARTITION BY c.name ORDER BY c.image IS NULL, s.released DESC) AS rn,
                   (c.name_folded LIKE ? ESCAPE '\\') AS starts
              FROM cards c ${SET_JOIN}
             WHERE ${SHOWN}
               AND (c.name_folded LIKE ? ESCAPE '\\'
                    ${phrase ? 'OR c.id IN (SELECT id FROM card_search WHERE card_search MATCH ?)' : ''}))
           WHERE rn = 1
           ORDER BY starts DESC, name COLLATE NOCASE
           LIMIT ?`,
    args: [start, lang, lang, start, ...(phrase ? [`{name name_en} : ${phrase}*`] : []), limit] as InValue[],
  }
}

/** Every printing of a card (same key), newest first. */
export function buildPrintsQuery(key: string, lang: string) {
  return {
    sql: `SELECT ${CARD_COLUMNS} FROM cards c ${SET_JOIN}
           WHERE c.card_key = ? AND ${SHOWN}
           ORDER BY c.image IS NULL, s.released DESC, ${NUMBER_ORDER}`,
    args: [key, lang, lang] as InValue[],
  }
}

export function buildSetsQuery(lang: string) {
  return {
    sql: `SELECT s.*, (SELECT COUNT(*) FROM cards c WHERE c.set_code = s.code AND c.lang = s.lang) AS cards
            FROM sets s
           WHERE s.lang = ? OR NOT EXISTS (SELECT 1 FROM sets o WHERE o.code = s.code AND o.lang = ?)
           ORDER BY s.released DESC, s.code`,
    args: [lang, lang] as InValue[],
  }
}

function json<T>(v: unknown, fallback: T): T {
  if (typeof v !== 'string' || !v)
    return fallback
  try {
    return JSON.parse(v) ?? fallback
  }
  catch {
    return fallback
  }
}

const num = (v: unknown) => (v == null ? null : Number(v))

export function toTcgCard(game: TcgGameId, r: Row): TcgCard {
  const extra = json<Record<string, any>>(r.extra, {})
  const mask = Number(r.finishes ?? 1)
  const image = tcgImageUrl(game, r.image) ?? ''
  return {
    id: String(r.id),
    lang: r.lang === 'fr' ? 'fr' : 'en',
    key: String(r.card_key),
    name: String(r.name),
    nameEn: r.name_en == null || r.name_en === r.name ? null : String(r.name_en),
    number: String(r.number),
    set: String(r.set_code),
    setName: r.set_name == null ? null : String(r.set_name),
    rarity: r.rarity == null ? null : String(r.rarity),
    category: String(r.category),
    subtype: r.subtype == null ? null : String(r.subtype),
    types: json(r.types, []),
    stats: json(r.stats, {}),
    text: r.text == null ? null : String(r.text),
    image,
    thumb: tcgImageUrl(game, r.thumb) ?? image,
    finishes: (Object.keys(FINISH_BIT) as TcgFinish[]).filter(f => mask & FINISH_BIT[f]),
    price: num(r.price_eur),
    priceFoil: num(r.price_eur_foil),
    regulation: r.regulation == null ? null : String(r.regulation),
    legal: json(r.legal, []),
    banned: !!r.banned,
    illustrator: extra.illustrator ?? null,
    attacks: extra.attacks ?? [],
    abilities: extra.abilities ?? [],
    weaknesses: extra.weaknesses ?? [],
    resistances: extra.resistances ?? [],
    evolveFrom: extra.evolveFrom ?? null,
    suffix: extra.suffix ?? null,
  }
}

export function toTcgSet(game: TcgGameId, r: Row): TcgSet & { cards: number } {
  return {
    code: String(r.code),
    name: String(r.name),
    series: r.series == null ? null : String(r.series),
    released: r.released == null ? null : String(r.released),
    total: Number(r.total ?? 0),
    symbol: tcgImageUrl(game, r.symbol),
    logo: tcgImageUrl(game, r.logo),
    cards: Number(r.cards ?? 0),
  }
}
