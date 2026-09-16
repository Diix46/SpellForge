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
 *  - **The printing is chosen inside the query.** One correlated subquery picks
 *    the best printing in the requested language and falls back to English when
 *    there is none — which is the whole five-call cascade the app used to run
 *    per card, collapsed into the search itself.
 */

import type { InValue } from '@libsql/client'

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

/** Strip accents and lowercase — matches the `name_folded` column built at ingest. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/**
 * FTS5 needs bare terms; it tokenizes punctuation away. Quote the phrase and
 * drop the characters that would be read as operators.
 */
function ftsPhrase(s: string): string {
  const cleaned = fold(s).replace(/["'()*:^-]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned ? `"${cleaned}"` : ''
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

function buildWhere(filters: SearchFilters, ctx: QueryContext): Where {
  const clauses: string[] = []
  const args: InValue[] = []

  // Always applied, mirroring the `-is:funny legal:commander` suffix the client
  // used to append to every query, plus Scryfall's own default hiding of
  // memorabilia, tokens and art series.
  clauses.push('o.legal_commander = 1', 'o.is_funny = 0', 'o.is_extra = 0')

  const ftsParts: string[] = []

  if (filters.text?.trim()) {
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

export function buildCardQuery(
  filters: SearchFilters,
  ctx: QueryContext,
  order: SortOrder = 'edhrec',
  page = 1,
): BuiltQuery {
  const { clauses, args } = buildWhere(filters, ctx)
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const offset = Math.max(0, (page - 1) * PAGE_SIZE)

  const orderBy = ORDER_BY[order] ?? ORDER_BY.edhrec

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

/** Name autocomplete, accent-insensitive, most-played first. */
export function buildAutocompleteQuery(prefix: string, limit = 20) {
  return {
    sql: `SELECT o.name FROM oracle_cards o
           WHERE o.name_folded >= ? AND o.name_folded < ?
             AND o.is_extra = 0 AND o.is_funny = 0
           ORDER BY o.edhrec_sort ASC
           LIMIT ?`,
    // A range, not `LIKE 'prefix%'`: SQLite's LIKE is case-insensitive by
    // default and so cannot use the index on name_folded — it scanned all 38 789
    // cards on every keystroke. The column is already lowercased, so a binary
    // range expresses the same prefix and walks the index.
    args: [fold(prefix), `${fold(prefix)}${PREFIX_END}`, limit],
  }
}
