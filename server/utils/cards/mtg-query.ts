/**
 * Magic card search — the local replacement for `buildScryfallQuery`.
 *
 * The app used to assemble a Scryfall syntax string on the client and send it
 * over the network. The filter contract stays byte-for-byte identical; only the
 * backend changes, so nothing above this module has to know Scryfall is gone.
 *
 * Two design points carry most of the performance:
 *
 *  - **Colour tests are integer masks, not string containment.** `id<=WUBG`
 *    (subset) is `mask & ~allowed = 0`; `color>=UB` (superset) is
 *    `mask & wanted = wanted`. Five bits means 32 possible values, so the index
 *    is dense and the test is free. This matters because the default browse
 *    query filters on colour identity on every single keystroke.
 *
 *  - **The printing is chosen at ingest.** `best_printings` holds the printing
 *    to show per card and language, English fallback included — the five-call
 *    cascade the app used to run per card, reduced to one indexed join.
 *
 * Text typed in Scryfall syntax (`t:instant cmc<=2`) is compiled by
 * mtg-syntax.ts into one more clause, ANDed with the builder's filters.
 */

import type { InValue } from '@libsql/client'
import type { CompiledSyntax } from './mtg-syntax'
import { compileSyntax, isSyntaxQuery, QuerySyntaxError } from './mtg-syntax'
import { fold, ftsPhrase } from './text'

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G'
export type SortOrder = 'edhrec' | 'eur' | 'name' | 'cmc'
export type CardTypeFilter = 'creature' | 'instant' | 'sorcery' | 'artifact' | 'enchantment' | 'planeswalker' | 'land'

export interface SearchFilters {
  text?: string
  themes?: string[]
  type?: CardTypeFilter | ''
  subtype?: string
  colors?: ManaColor[]
  maxCmc?: number | null
  maxPrice?: number | null
  commanderOnly?: boolean
}

export interface QueryContext {
  /** Commander colour identity; `null` disables the identity filter entirely. */
  identity?: ManaColor[] | null
  lang: string
}

const COLOR_BIT: Record<ManaColor, number> = { W: 1, U: 2, B: 4, R: 8, G: 16 }
const ALL_COLORS = 0b11111

export function maskOf(colors: readonly ManaColor[] | null | undefined): number {
  let m = 0
  for (const c of colors ?? []) m |= COLOR_BIT[c] ?? 0
  return m
}

/**
 * The ten curated themes, ported from `SEARCH_THEMES`.
 *
 * Most were Scryfall `oracle:` substring searches, which become FTS5 column
 * queries. Two caveats worth knowing rather than discovering later:
 *  - `ramp` searched `oracle:"add {"`; FTS5 discards `{`, so the mana-adding
 *    half degrades to the word "add" narrowed by type. Slightly looser.
 *  - `flying` was `keyword:flying`, which is not text at all — it reads the
 *    `keywords` JSON array instead.
 */
export const THEMES: Record<string, { fts?: string, sql?: string }> = {
  draw: { fts: 'oracle_text : "draw a card"' },
  removal: { fts: 'oracle_text : (destroy OR exile) AND oracle_text : (creature OR permanent)' },
  ramp: { fts: '(oracle_text : "search your library for a" AND oracle_text : land) OR (oracle_text : add AND type_line : artifact)' },
  tokens: { fts: 'oracle_text : create AND oracle_text : token' },
  lifegain: { fts: 'oracle_text : gain AND oracle_text : life' },
  counter: { fts: 'oracle_text : "counter target"' },
  boardwipe: { fts: 'oracle_text : ("destroy all" OR "each creature")' },
  tutor: { fts: 'oracle_text : "search your library for a"' },
  graveyard: { fts: 'oracle_text : "from your graveyard"' },
  flying: { sql: `o.keywords LIKE '%"Flying"%'` },
}

/**
 * Sorting reads dedicated `*_sort` columns, never the nullable originals.
 *
 * NULLs sort first on ASC in SQLite, which would put unranked cards at the top
 * of the most-played list. The obvious guard — `ORDER BY rank IS NULL, rank` —
 * fixes the order but *leads with an expression*, which no index can serve: it
 * forced a TEMP B-TREE over 24 000 rows and made the browse 66 ms. Pushing the
 * null-handling into the data at ingest (NULL becomes a high sentinel) keeps the
 * ORDER BY a plain indexed column walk.
 *
 * Parameterised by table alias so the same ordering can be applied inside the
 * paging CTE and again on its result.
 */
const ORDER_BY: Record<SortOrder, (p: string) => string> = {
  edhrec: p => `${p}.edhrec_sort ASC`,
  eur: p => `${p}.price_sort ASC`,
  name: p => `${p}.name COLLATE NOCASE ASC`,
  cmc: p => `${p}.cmc ASC, ${p}.edhrec_sort ASC`,
}

export const PAGE_SIZE = 175

const PRINTING_COLUMNS = `
  p.id AS printing_id, p.lang, p.set_code, p.set_name, p.collector_number,
  p.released_at, p.rarity, p.promo, p.image_status, p.img_version, p.artist,
  p.printed_name, p.printed_type_line, p.printed_text, p.price_eur`

/**
 * Which printing to show for a card in a given language is resolved **at ingest**
 * and stored in `best_printings`, so the search is a plain indexed equality.
 *
 * The first version was a correlated subquery ordering by
 * `(lang = ?) DESC, is_highres DESC, released_at DESC`: not indexable, so SQLite
 * gathered and sorted every printing of every card, 175 times per page — 168 ms
 * on the default browse. Precomputing turns the same answer into one lookup.
 */
const BEST_PRINTING_JOIN = `
  JOIN best_printings bp ON bp.oracle_id = page.oracle_id AND bp.lang = ?
  JOIN printings p ON p.id = bp.printing_id`

interface Where { clauses: string[], args: InValue[] }

/** The search box text, compiled when it is written in query syntax. */
function syntaxOf(filters: SearchFilters): CompiledSyntax | null {
  const text = filters.text?.trim()
  return text && isSyntaxQuery(text) ? compileSyntax(text) : null
}

function buildWhere(filters: SearchFilters, ctx: QueryContext, syntax: CompiledSyntax | null): Where {
  const clauses: string[] = []
  const args: InValue[] = []

  // Always applied, mirroring the `-is:funny legal:commander` suffix the client
  // used to append to every query, plus Scryfall's own default hiding of
  // memorabilia, tokens and art series.
  clauses.push('o.legal_commander = 1', 'o.is_funny = 0', 'o.is_extra = 0')

  const ftsParts: string[] = []

  // Query syntax becomes its own clause, ANDed with every other filter — a
  // commander's identity still applies to `t:instant cmc<=2`.
  if (syntax) {
    clauses.push(syntax.where)
    args.push(...syntax.args)
  }
  else if (filters.text?.trim()) {
    const phrase = ftsPhrase(filters.text)
    if (phrase)
      ftsParts.push(phrase)
  }

  for (const key of filters.themes ?? []) {
    const theme = THEMES[key]
    if (!theme)
      continue
    if (theme.fts)
      ftsParts.push(`(${theme.fts})`)
    if (theme.sql)
      clauses.push(theme.sql)
  }

  if (ftsParts.length) {
    clauses.push(`o.oracle_id IN (SELECT oracle_id FROM card_search WHERE card_search MATCH ?)`)
    args.push(ftsParts.join(' AND '))
  }

  if (filters.type) {
    clauses.push('o.type_line LIKE ?')
    args.push(`%${filters.type}%`)
  }

  if (filters.subtype?.trim()) {
    clauses.push('o.type_line LIKE ?')
    args.push(`%${filters.subtype.trim()}%`)
  }

  // `color>=` — the card must BE at least these colours (superset test).
  const want = maskOf(filters.colors)
  if (want) {
    clauses.push('(o.colors_mask & ?) = ?')
    args.push(want, want)
  }

  // `id<=` — the card must fit INSIDE the commander's identity (subset test).
  // An empty identity is colourless, which is a real filter, not "no filter";
  // only a null identity disables it.
  if (ctx.identity != null) {
    const allowed = maskOf(ctx.identity)
    clauses.push('(o.identity_mask & ~?) = 0')
    args.push(allowed & ALL_COLORS)
  }

  if (filters.maxCmc != null) {
    clauses.push('o.cmc <= ?')
    args.push(filters.maxCmc)
  }

  // Budget filters on the cheapest printing of the card, never on the selected
  // one: only 1.9% of French printings carry a EUR price, so filtering on the
  // French row's own price would hide 98% of the catalogue.
  if (filters.maxPrice != null) {
    clauses.push('o.min_price_eur IS NOT NULL', 'o.min_price_eur <= ?')
    args.push(filters.maxPrice)
  }

  if (filters.commanderOnly)
    clauses.push('o.is_commander = 1')

  return { clauses, args }
}

export interface BuiltQuery {
  sql: string
  args: InValue[]
  countSql: string
  countArgs: InValue[]
}

/**
 * Throws `QuerySyntaxError` when the search text is query syntax we cannot
 * honour; the caller decides how to report it.
 */
export function buildCardQuery(
  filters: SearchFilters,
  ctx: QueryContext,
  order: SortOrder = 'edhrec',
  page = 1,
): BuiltQuery {
  const syntax = syntaxOf(filters)
  const { clauses, args } = buildWhere(filters, ctx, syntax)
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const offset = Math.max(0, (page - 1) * PAGE_SIZE)

  // An `order:` typed in the query wins, as it does on Scryfall.
  const orderBy = ORDER_BY[syntax?.order ?? order] ?? ORDER_BY.edhrec

  return {
    // The CTE pages `oracle_cards` FIRST, then joins printings for the 175 rows
    // that survive. Without it SQLite chose `best_printings` as the driving
    // table and scanned all 77 578 of its rows before sorting — `SCAN bp` in the
    // query plan. Filtering and paging before the join is the whole point.
    sql: `WITH page AS (
            SELECT o.* FROM oracle_cards o
             ${where}
             ORDER BY ${orderBy('o')}
             LIMIT ? OFFSET ?
          )
          SELECT page.*, ${PRINTING_COLUMNS}
            FROM page
            ${BEST_PRINTING_JOIN}
           ORDER BY ${orderBy('page')}`,
    // WHERE args first (they live inside the CTE), then paging, then ?lang.
    args: [...args, PAGE_SIZE, offset, ctx.lang],

    // The count deliberately skips the printing join: it only needs to know how
    // many cards match, and the join is the expensive half.
    countSql: `SELECT COUNT(*) AS total FROM oracle_cards o ${where}`,
    countArgs: args,
  }
}

/**
 * The coach's card search: the same filters as the builder with no commander
 * constraint, returning only what the model reads. Throws `QuerySyntaxError`
 * like buildCardQuery — and for an empty query, which would otherwise hand the
 * model the 20 most played cards as if they answered something.
 */
export function buildCoachSearchQuery(text: string, limit = 20) {
  if (!text.trim())
    throw new QuerySyntaxError('badValue', text)
  const filters: SearchFilters = { text }
  const syntax = syntaxOf(filters)
  const { clauses, args } = buildWhere(filters, { identity: null, lang: 'en' }, syntax)
  const where = `WHERE ${clauses.join(' AND ')}`
  return {
    sql: `SELECT o.name, o.mana_cost, o.type_line, o.oracle_all, o.identity_mask, o.min_price_eur
            FROM oracle_cards o
           ${where}
           ORDER BY ${(ORDER_BY[syntax?.order ?? 'edhrec'] ?? ORDER_BY.edhrec)('o')}
           LIMIT ?`,
    args: [...args, limit],
    countSql: `SELECT COUNT(*) AS total FROM oracle_cards o ${where}`,
    countArgs: args,
  }
}

/** Exact lookup for a pinned printing, the `(SET) 123` suffix round-trip. */
export function buildPinnedQuery(setCode: string, collectorNumber: string, lang: string) {
  return {
    sql: `SELECT o.*, ${PRINTING_COLUMNS}
            FROM printings p
            JOIN oracle_cards o ON o.oracle_id = p.oracle_id
           WHERE p.set_code = ? AND p.collector_number = ? AND p.lang IN (?, 'en')
           ORDER BY (p.lang = ?) DESC
           LIMIT 1`,
    args: [setCode.toLowerCase(), collectorNumber, lang, lang],
  }
}

/**
 * Highest BMP code unit: appended to a prefix, it bounds the range of every
 * string starting with that prefix. Built from its code rather than written as
 * an escape, so no tooling can silently turn it into an invisible character.
 */
const PREFIX_END = String.fromCharCode(0xFFFF)

/**
 * Name autocomplete, accent-insensitive.
 *
 * Mirrors Scryfall's behaviour, checked against the live API: names that START
 * with the text come first, then names where the text starts a later word
 * ("praetor" → "Praetor's Grasp", then "Ebon Praetor"). Each group is ordered
 * by popularity.
 *
 * The name-start half is a binary range, not `LIKE 'prefix%'`: SQLite's LIKE is
 * case-insensitive by default and cannot use the index on name_folded — it
 * scanned all 38 789 cards on every keystroke. The later-word half is an FTS5
 * prefix query on the name column.
 */
export function buildAutocompleteQuery(prefix: string, limit = 20) {
  const start = fold(prefix)
  const phrase = ftsPhrase(prefix)
  const args: InValue[] = [start, `${start}${PREFIX_END}`]

  let candidates = `
    SELECT o.name, 0 AS grp, o.edhrec_sort FROM oracle_cards o
     WHERE o.name_folded >= ? AND o.name_folded < ?
       AND o.is_extra = 0 AND o.is_funny = 0`
  if (phrase) {
    candidates += `
    UNION ALL
    SELECT o.name, 1 AS grp, o.edhrec_sort FROM oracle_cards o
     WHERE o.oracle_id IN (SELECT oracle_id FROM card_search WHERE card_search MATCH ?)
       AND o.is_extra = 0 AND o.is_funny = 0`
    // FTS5 marks the last token of a phrase as a prefix when `*` follows it.
    args.push(`name_folded : ${phrase}*`)
  }
  args.push(limit)

  return {
    // A name matching both ways is kept once, ranked by its better group.
    sql: `SELECT name FROM (${candidates})
           GROUP BY name
           ORDER BY MIN(grp), MIN(edhrec_sort)
           LIMIT ?`,
    args,
  }
}

/**
 * Every printing of one card, for the edition picker, newest first: only the
 * requested language when the card has a printing in it, English otherwise.
 * Deck resolution puts the language before a pinned art, so a pin on a printing
 * of the other language would silently not show — it is not offered.
 *
 * `withEnglish` adds every English printing after the localised ones: the
 * picker offers them as an explicit "[EN]" choice, which resolution honours.
 *
 * Picks ONE card before listing printings. Several cards can answer to a name —
 * "Sol Ring // Sol Ring" is an art-series card sharing Sol Ring's front face
 * name — and listing them all would let a player pin an art card, silently
 * swapping the deck's playable card for an unplayable one. Exact full name
 * first, real cards before extras, then the most played.
 */
// The English twin's column for a French printing (same set and number):
// Cardmarket prices a printing whatever its language, and French ones are
// rarely priced on their own.
const EN_TWIN = (col: string) => `SELECT e.${col} FROM printings e WHERE e.set_code = p.set_code AND e.collector_number = p.collector_number AND e.lang = 'en' AND p.lang != 'en'`

export function buildPrintsQuery(name: string, lang: string, withEnglish = false, hasStyle = true, hasFinishes = true) {
  const key = fold(name)
  return {
    sql: `SELECT p.id, p.set_code, p.set_name, p.collector_number, p.lang,
                 p.img_version, p.price_eur, p.promo, p.is_highres, p.released_at, p.rarity,
                 p.artist, ${hasStyle ? 'p.style' : '0 AS style'},
                 ${hasFinishes ? `p.finishes, COALESCE(p.price_eur_foil, (${EN_TWIN('price_eur_foil')})) AS price_eur_foil` : '1 AS finishes, NULL AS price_eur_foil'},
                 COALESCE(p.price_eur, (${EN_TWIN('price_eur')})) AS twin_price_eur
            FROM printings p
           WHERE p.is_real_image = 1
             AND p.oracle_id = (
               SELECT o.oracle_id FROM oracle_cards o
                WHERE o.name_folded = ? OR o.name_front = ?
                ORDER BY (o.name_folded = ?) DESC, o.is_extra ASC, o.edhrec_sort ASC
                LIMIT 1)
             AND (p.lang = ? OR (p.lang = 'en' AND (? OR NOT EXISTS (
                   SELECT 1 FROM printings l
                    WHERE l.oracle_id = p.oracle_id AND l.lang = ? AND l.is_real_image = 1))))
           ORDER BY (p.lang = ?) DESC, p.released_at DESC`,
    args: [key, key, key, lang, withEnglish ? 1 : 0, lang, lang] as InValue[],
  }
}
