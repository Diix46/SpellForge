/**
 * Scryfall search syntax, compiled to SQL against the local card database.
 *
 * Power users type `t:instant cmc<=2 o:"draw a card"`, and the coach's search
 * tool writes the same language. This module parses it into a tree and
 * compiles the tree into one WHERE fragment, which the search engine ANDs with
 * the builder's own filters (commander identity, themes, budget).
 *
 * One rule shapes everything here: a filter we cannot honour is an error,
 * never a silent no-op. Dropping `usd<5` would list 40 € cards with no hint
 * why. Display options (`unique:`, `lang:`, `dir:`…) are different — they do
 * not change which cards match — so those are ignored.
 *
 * Like Scryfall, printing filters must hold on ONE printing: `r:rare s:m21` is
 * a card that was rare in M21, not a card rare somewhere and printed in M21 at
 * any rarity (27 false hits out of 107 before this). Likewise power and
 * toughness are read per face, so `pow>=3` finds Delver of Secrets by its back.
 *
 * Known departures from Scryfall, all deliberate:
 *  - Bare words match whole words or word starts of the English or French
 *    name ("bolt" finds Lightning Bolt, "ightning" does not). Scryfall matches
 *    any substring of the English name.
 *  - Printing filters are checked on English printings, Scryfall's default;
 *    the printing shown is still the usual one for the site's language.
 *  - Only EUR prices exist locally, `game:` only knows paper, and no regex.
 *
 * Every query runs on the server's single event loop — the local libSQL
 * client is synchronous — so a slow one stalls every user. Each construct
 * here is bounded: indexed lookups, subqueries SQLite runs once, correlated
 * ones only through an index, and caps on terms and nesting.
 */
import type { InValue } from '@libsql/client'
import type { SortOrder } from './mtg-query'
import { fold, ftsPhrase, likeContains } from './text'

export type SyntaxErrorCode
  = | 'unknownKeyword'
    | 'unsupportedKeyword'
    | 'badValue'
    | 'badOperator'
    | 'unbalanced'
    | 'tooComplex'

/** A query we refuse to run, with the offending fragment for the message. */
export class QuerySyntaxError extends Error {
  constructor(readonly code: SyntaxErrorCode, readonly term: string) {
    super(`${code}: ${term}`)
    this.name = 'QuerySyntaxError'
  }
}

type Op = ':' | '=' | '!=' | '<' | '<=' | '>' | '>='

interface Term {
  key: string | null
  op: Op
  value: string
  /** `!name` — exact card name. */
  exact: boolean
  /** The fragment as typed, for error messages. */
  raw: string
}

type Token
  = | { t: 'lparen' | 'rparen' | 'or' | 'and' | 'not' }
    | { t: 'term', term: Term }

type Node
  = | { kind: 'and' | 'or', nodes: Node[] }
    | { kind: 'not', node: Node }
    | { kind: 'term', term: Term }

const MAX_LENGTH = 500
const MAX_TERMS = 40
const MAX_DEPTH = 12

// ─── tokenizer ──────────────────────────────────────────────────────────────

const KEY_OP = /^([a-z]+)(>=|<=|!=|[:=<>])/i
const BREAK = /[\s()]/

function tokenize(input: string): Token[] {
  const out: Token[] = []
  const n = input.length
  let i = 0
  while (i < n) {
    const ch = input[i]!
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '(' || ch === ')') {
      out.push({ t: ch === '(' ? 'lparen' : 'rparen' })
      i++
      continue
    }
    const next = input[i + 1]
    // `-(t:elf or t:goblin)` negates a group: "(" breaks a word but not a negation.
    if (ch === '-' && next !== undefined && (next === '(' || !BREAK.test(next))) {
      out.push({ t: 'not' })
      i++
      continue
    }

    const start = i
    const exact = ch === '!' && next !== undefined && !BREAK.test(next)
    if (exact)
      i++

    let key: string | null = null
    let op: Op = ':'
    const m = exact ? null : KEY_OP.exec(input.slice(i))
    if (m) {
      key = m[1]!.toLowerCase()
      op = m[2] as Op
      i += m[0].length
    }

    let value: string
    const quoted = input[i] === '"'
    if (quoted) {
      // An unclosed quote runs to the end, as Scryfall reads it.
      const end = input.indexOf('"', i + 1)
      value = input.slice(i + 1, end === -1 ? n : end)
      i = end === -1 ? n : end + 1
    }
    else {
      const from = i
      while (i < n && !BREAK.test(input[i]!)) i++
      value = input.slice(from, i)
    }
    const raw = input.slice(start, i)

    if (!key && !exact && !quoted && /^(?:or|and)$/i.test(value)) {
      out.push({ t: value.toLowerCase() as 'or' | 'and' })
      continue
    }
    if (key && !quoted && value.startsWith('/'))
      throw new QuerySyntaxError('badValue', raw)
    out.push({ t: 'term', term: { key, op, value: value.trim(), exact, raw } })
  }
  return out
}

// ─── parser ─────────────────────────────────────────────────────────────────
// or    := and ('or' and)*
// and   := unary+          (an explicit 'and' is allowed and ignored)
// unary := '-' unary | '(' or ')' | term

const EMPTY: Node = { kind: 'and', nodes: [] }

function parse(tokens: Token[]): Node {
  let pos = 0
  let terms = 0

  function parseOr(depth: number): Node {
    const nodes = [parseAnd(depth)]
    while (tokens[pos]?.t === 'or') {
      pos++
      nodes.push(parseAnd(depth))
    }
    return nodes.length === 1 ? nodes[0]! : { kind: 'or', nodes }
  }

  function parseAnd(depth: number): Node {
    const nodes: Node[] = []
    for (let tok = tokens[pos]; tok && tok.t !== 'or' && tok.t !== 'rparen'; tok = tokens[pos]) {
      if (tok.t === 'and') {
        pos++
        continue
      }
      nodes.push(parseUnary(depth))
    }
    return nodes.length === 1 ? nodes[0]! : { kind: 'and', nodes }
  }

  function parseUnary(depth: number): Node {
    const tok = tokens[pos]
    if (tok?.t === 'not') {
      // Negations nest like groups: 250 of them overflowed SQLite's parser.
      if (depth >= MAX_DEPTH)
        throw new QuerySyntaxError('tooComplex', '-')
      pos++
      return { kind: 'not', node: parseUnary(depth + 1) }
    }
    if (tok?.t === 'lparen') {
      if (depth >= MAX_DEPTH)
        throw new QuerySyntaxError('tooComplex', '(')
      pos++
      const inner = parseOr(depth + 1)
      // An unclosed group runs to the end of the query.
      if (tokens[pos]?.t === 'rparen')
        pos++
      return inner
    }
    if (tok?.t === 'term') {
      pos++
      if (++terms > MAX_TERMS)
        throw new QuerySyntaxError('tooComplex', tok.term.raw)
      return { kind: 'term', term: tok.term }
    }
    // A dangling "-" before "or", ")" or the end: nothing to negate.
    return EMPTY
  }

  const root = parseOr(0)
  if (pos < tokens.length)
    throw new QuerySyntaxError('unbalanced', ')')
  return root
}

// ─── keywords ───────────────────────────────────────────────────────────────

type Handler = (term: Term, args: InValue[]) => string

const SQL_OP: Record<Op, string> = { ':': '=', '=': '=', '!=': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=' }

/**
 * Lookup in a keyword table, blind to Object.prototype: `is:constructor` is a
 * bad value, not a function spliced into the SQL (a 500 before this).
 */
function own<T>(table: Record<string, T>, name: string): T | undefined {
  return Object.hasOwn(table, name) ? table[name] : undefined
}

function equalityOnly(term: Term) {
  if (term.op !== ':' && term.op !== '=')
    throw new QuerySyntaxError('badOperator', term.raw)
}

/** A text column containing the value, case-insensitively. */
function textContains(column: string): Handler {
  return (term, args) => {
    equalityOnly(term)
    args.push(likeContains(term.value))
    return `${column} LIKE ? ESCAPE '\\'`
  }
}

/**
 * Rules text. `~` stands for the card itself — its name, or "this creature"
 * and the like since the 2025 self-reference update — so those queries read
 * the column where both are already written `~`.
 */
function oracleHandler(term: Term, args: InValue[]): string {
  return textContains(term.value.includes('~') ? 'o.self_text' : 'o.rules_text')(term, args)
}

/**
 * Cards with a face satisfying `condition` (see oracle_faces). A condition
 * that reads the card (`o.cmc`) must probe each card's own faces through the
 * index: as an IN subquery SQLite rescanned all 40 000 faces for every card,
 * and `cmc>pow` blocked the whole server for three minutes.
 */
function hasFace(condition: string, readsCard = false): string {
  return readsCard
    ? `EXISTS (SELECT 1 FROM oracle_faces f WHERE f.oracle_id = o.oracle_id AND ${condition})`
    : `o.oracle_id IN (SELECT oracle_id FROM oracle_faces WHERE ${condition})`
}

function nameWords(term: Term, args: InValue[]): string {
  equalityOnly(term)
  // The trailing `*` makes the last word a prefix, so a half-typed name matches.
  args.push(`{name_folded printed_name} : ${ftsPhrase(term.value)}*`)
  return `o.oracle_id IN (SELECT oracle_id FROM card_search WHERE card_search MATCH ?)`
}

function exactName(term: Term, args: InValue[]): string {
  const name = fold(term.value)
  args.push(name, name)
  return `(o.name_folded = ? OR o.name_front = ?)`
}

// Colours ────────────────────────────────────────────────────────────────────

const COLOR_BIT: Record<string, number> = { W: 1, U: 2, B: 4, R: 8, G: 16, C: 32 }

const COLOR_NAMES: Record<string, string> = {
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
  colorless: 'C',
  multicolor: 'M',
  azorius: 'WU',
  dimir: 'UB',
  rakdos: 'BR',
  gruul: 'RG',
  selesnya: 'GW',
  orzhov: 'WB',
  izzet: 'UR',
  golgari: 'BG',
  boros: 'RW',
  simic: 'GU',
  silverquill: 'WB',
  prismari: 'UR',
  witherbloom: 'BG',
  lorehold: 'RW',
  quandrix: 'GU',
  bant: 'GWU',
  esper: 'WUB',
  grixis: 'UBR',
  jund: 'BRG',
  naya: 'RGW',
  abzan: 'WBG',
  jeskai: 'URW',
  sultai: 'BGU',
  mardu: 'RWB',
  temur: 'GUR',
  chaos: 'UBRG',
  glint: 'UBRG',
  aggression: 'BRGW',
  dune: 'BRGW',
  altruism: 'RGWU',
  ink: 'RGWU',
  growth: 'GWUB',
  witch: 'GWUB',
  artifice: 'WUBR',
  yore: 'WUBR',
}

type ColorValue = { mask: number } | { count: number } | { multi: true }

function parseColors(term: Term, allowColorless: boolean): ColorValue {
  const v = term.value.toLowerCase()
  if (/^\d$/.test(v))
    return { count: Number(v) }
  const letters = (own(COLOR_NAMES, v) ?? v).toUpperCase()
  if (letters === 'M')
    return { multi: true }
  // Colourless is a colour of its own only for produced mana; for a card's
  // colours or identity, "c" means "no colour at all".
  if (letters === 'C' && !allowColorless)
    return { mask: 0 }
  const valid = allowColorless ? /^[WUBRGC]+$/ : /^[WUBRG]+$/
  if (!valid.test(letters))
    throw new QuerySyntaxError('badValue', term.raw)
  let mask = 0
  for (const c of letters) mask |= COLOR_BIT[c]!
  return { mask }
}

/** Number of set bits among the six mana bits. `+` binds tighter than `&` in SQLite. */
function popcount(col: string): string {
  return `(${[0, 1, 2, 3, 4, 5].map(b => `((${col} >> ${b}) & 1)`).join(' + ')})`
}

/**
 * Colour comparisons on a bitmask column. `:` means "at least" for colours
 * and "within" for identity, as on Scryfall — `id:wu` lists every card an
 * Azorius commander can play.
 */
function colorHandler(column: string, colonMeans: '>=' | '<=', allowColorless = false): Handler {
  return (term) => {
    const parsed = parseColors(term, allowColorless)
    if ('count' in parsed)
      return `${popcount(column)} ${SQL_OP[term.op]} ${parsed.count}`
    if ('multi' in parsed) {
      if (term.op === '!=')
        return `${popcount(column)} < 2`
      if (term.op === ':' || term.op === '=' || term.op === '>=')
        return `${popcount(column)} >= 2`
      throw new QuerySyntaxError('badOperator', term.raw)
    }
    const m = parsed.mask
    // Masks are validated integers in 0..63, inlined rather than bound.
    const superset = `(${column} & ${m}) = ${m}`
    const subset = `(${column} & ~${m}) = 0`
    switch (term.op) {
      case ':':
        // `c:c` is "colourless", not "a superset of nothing" (every card).
        if (m === 0)
          return `${column} = 0`
        return colonMeans === '>=' ? superset : subset
      case '>=': return superset
      case '>': return `(${superset} AND ${column} != ${m})`
      case '<=': return subset
      case '<': return `(${subset} AND ${column} != ${m})`
      case '=': return `${column} = ${m}`
      case '!=': return `${column} != ${m}`
    }
  }
}

// Numbers ────────────────────────────────────────────────────────────────────

type NumericField = 'cmc' | 'pow' | 'tou' | 'loy'

/** Per-face stat columns of oracle_faces; `*` casts to 0, as Scryfall counts it. */
const STAT_COLUMN: Record<Exclude<NumericField, 'cmc'>, string> = { pow: 'power', tou: 'toughness', loy: 'loyalty' }

const NUMERIC_ALIAS: Record<string, NumericField> = {
  cmc: 'cmc',
  mv: 'cmc',
  manavalue: 'cmc',
  pow: 'pow',
  power: 'pow',
  tou: 'tou',
  toughness: 'tou',
  loy: 'loy',
  loyalty: 'loy',
}

/** The SQL for a field, plus the guard that keeps a face without it from matching. */
function numericExpr(field: NumericField): { expr: string, guard: string | null } {
  if (field === 'cmc')
    return { expr: 'o.cmc', guard: null }
  const col = STAT_COLUMN[field]
  return { expr: `CAST(${col} AS REAL)`, guard: `${col} IS NOT NULL` }
}

function numericHandler(field: NumericField): Handler {
  const self = numericExpr(field)
  return (term, args) => {
    const v = term.value.toLowerCase()
    let test: string
    let guards: (string | null)[] = [self.guard]
    const other = own(NUMERIC_ALIAS, v)
    if (other) {
      // `pow>tou`: two numbers of the same face (or of the card, for cmc).
      const that = numericExpr(other)
      guards = [self.guard, that.guard]
      test = `${self.expr} ${SQL_OP[term.op]} ${that.expr}`
    }
    else if (field === 'cmc' && (v === 'even' || v === 'odd')) {
      equalityOnly(term)
      return `(CAST(o.cmc AS INTEGER) % 2) = ${v === 'even' ? 0 : 1}`
    }
    else {
      const n = Number(v)
      if (v === '' || !Number.isFinite(n))
        throw new QuerySyntaxError('badValue', term.raw)
      args.push(n)
      test = `${self.expr} ${SQL_OP[term.op]} ?`
    }
    const present = guards.filter((g): g is string => g !== null)
    if (!present.length)
      return test
    // Any stat involved means the test runs per face; comparing one with cmc
    // also reads the card.
    return hasFace([...present, test].join(' AND '), field === 'cmc' || other === 'cmc')
  }
}

function priceHandler(term: Term, args: InValue[]): string {
  const n = Number(term.value)
  if (term.value === '' || !Number.isFinite(n))
    throw new QuerySyntaxError('badValue', term.raw)
  args.push(n)
  // The card's cheapest printing, like the builder's budget filter.
  return `(o.min_price_eur IS NOT NULL AND o.min_price_eur ${SQL_OP[term.op]} ?)`
}

// Mana cost ──────────────────────────────────────────────────────────────────

/** `2GG`, `{2}{G}{G}` or `{G/U}` → the symbols as written in mana_cost. */
function manaSymbols(term: Term): string[] {
  const v = term.value.toUpperCase()
  const out: string[] = []
  let i = 0
  while (i < v.length) {
    const ch = v[i]!
    if (ch === '{') {
      const end = v.indexOf('}', i)
      if (end === -1)
        throw new QuerySyntaxError('badValue', term.raw)
      out.push(v.slice(i, end + 1))
      i = end + 1
    }
    else if (/\d/.test(ch)) {
      let j = i
      while (j < v.length && /\d/.test(v[j]!)) j++
      out.push(`{${v.slice(i, j)}}`)
      i = j
    }
    else if (/[WUBRGCXS]/.test(ch)) {
      out.push(`{${ch}}`)
      i++
    }
    else {
      throw new QuerySyntaxError('badValue', term.raw)
    }
  }
  if (!out.length)
    throw new QuerySyntaxError('badValue', term.raw)
  return out
}

function manaHandler(term: Term, args: InValue[]): string {
  const symbols = manaSymbols(term)
  if (term.op === '=') {
    args.push(symbols.join(''))
    return 'o.mana_cost = ?'
  }
  if (term.op !== ':' && term.op !== '>=')
    throw new QuerySyntaxError('badOperator', term.raw)
  // "At least these symbols", on one face. A number is a minimum of generic
  // mana, so `m:2WW` includes {3}{W}{W}, as on Scryfall; the face's generic
  // amount is summed at ingest, wherever it sits ({X}{2}{U}). Every other
  // symbol — {0} included, which only a literal zero cost contains — must
  // occur at least as often as asked.
  const cost = `COALESCE(mana_cost, '')`
  const tests: string[] = []
  const counts = new Map<string, number>()
  let generic = 0
  for (const symbol of symbols) {
    if (/^\{\d+\}$/.test(symbol) && symbol !== '{0}')
      generic += Number(symbol.slice(1, -1))
    else
      counts.set(symbol, (counts.get(symbol) ?? 0) + 1)
  }
  if (generic) {
    args.push(generic)
    tests.push('COALESCE(generic, 0) >= ?')
  }
  for (const [symbol, count] of counts) {
    // `{1}` is not a substring of `{10}`, so counting substrings is exact.
    args.push(symbol, count * symbol.length)
    tests.push(`(LENGTH(${cost}) - LENGTH(REPLACE(${cost}, ?, ''))) >= ?`)
  }
  return hasFace(tests.join(' AND '))
}

// Printings ──────────────────────────────────────────────────────────────────
// These return conditions on `printings p`; compileRoot() supplies the table.

const RARITIES = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus']
const RARITY_ALIAS: Record<string, string> = { c: 'common', u: 'uncommon', r: 'rare', m: 'mythic', s: 'special', b: 'bonus' }

function rarityHandler(term: Term): string {
  const v = term.value.toLowerCase()
  const rank = RARITIES.indexOf(own(RARITY_ALIAS, v) ?? v)
  if (rank === -1)
    throw new QuerySyntaxError('badValue', term.raw)
  const keep = RARITIES.filter((_, i) => {
    switch (term.op) {
      case '<': return i < rank
      case '<=': return i <= rank
      case '>': return i > rank
      case '>=': return i >= rank
      case '!=': return i !== rank
      default: return i === rank
    }
  })
  return keep.length ? `p.rarity IN (${keep.map(r => `'${r}'`).join(', ')})` : '0'
}

function setHandler(term: Term, args: InValue[]): string {
  equalityOnly(term)
  if (!/^[a-z0-9]{2,6}$/i.test(term.value))
    throw new QuerySyntaxError('badValue', term.raw)
  args.push(term.value.toLowerCase())
  return 'p.set_code = ?'
}

function yearHandler(term: Term, args: InValue[]): string {
  if (!/^\d{4}$/.test(term.value))
    throw new QuerySyntaxError('badValue', term.raw)
  args.push(Number(term.value))
  return `CAST(substr(p.released_at, 1, 4) AS INTEGER) ${SQL_OP[term.op]} ?`
}

function dateHandler(term: Term, args: InValue[]): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(term.value))
    throw new QuerySyntaxError('badValue', term.raw)
  args.push(term.value)
  return `p.released_at ${SQL_OP[term.op]} ?`
}

// Formats and flags ──────────────────────────────────────────────────────────

const FORMATS = new Set([
  'standard',
  'future',
  'historic',
  'timeless',
  'gladiator',
  'pioneer',
  'modern',
  'legacy',
  'pauper',
  'vintage',
  'penny',
  'commander',
  'oathbreaker',
  'standardbrawl',
  'brawl',
  'competitivebrawl',
  'alchemy',
  'paupercommander',
  'duel',
  'oldschool',
  'premodern',
  'predh',
])
const FORMAT_ALIAS: Record<string, string> = { edh: 'commander', pdh: 'paupercommander' }

function legalityHandler(statuses: string[]): Handler {
  return (term) => {
    equalityOnly(term)
    const v = term.value.toLowerCase()
    const format = own(FORMAT_ALIAS, v) ?? v
    if (!FORMATS.has(format))
      throw new QuerySyntaxError('badValue', term.raw)
    if (format === 'commander' && statuses.includes('legal'))
      return 'o.legal_commander = 1'
    // The format name is validated against the list above, so it can be inlined.
    return `json_extract(o.legalities, '$.${format}') IN (${statuses.map(s => `'${s}'`).join(', ')})`
  }
}

const typeHas = (...words: string[]) => `(${words.map(w => `o.type_line LIKE '%${w}%'`).join(' OR ')})`
const CREATURE = `o.type_line LIKE '%Creature%'`

const IS: Record<string, string> = {
  commander: 'o.is_commander = 1',
  funny: 'o.is_funny = 1',
  reserved: 'o.is_reserved = 1',
  gamechanger: 'o.is_game_changer = 1',
  gc: 'o.is_game_changer = 1',
  dfc: `o.layout IN ('transform', 'modal_dfc', 'reversible_card')`,
  mdfc: `o.layout = 'modal_dfc'`,
  transform: `o.layout = 'transform'`,
  split: `o.layout = 'split'`,
  flip: `o.layout = 'flip'`,
  meld: `o.layout = 'meld'`,
  adventure: `o.layout = 'adventure'`,
  leveler: `o.layout = 'leveler'`,
  permanent: typeHas('Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker', 'Battle'),
  spell: `o.type_line NOT LIKE '%Land%'`,
  historic: typeHas('Legendary', 'Artifact', 'Saga'),
  // A creature face with no rules text — the creature half of an adventure counts.
  vanilla: hasFace(`type_line LIKE '%Creature%' AND has_text = 0`),
  bear: `(o.cmc = 2 AND ${hasFace(`type_line LIKE '%Creature%' AND power = '2' AND toughness = '2'`)})`,
  party: `(${CREATURE} AND ${typeHas('Cleric', 'Rogue', 'Warrior', 'Wizard')})`,
  outlaw: `(${CREATURE} AND ${typeHas('Assassin', 'Mercenary', 'Pirate', 'Rogue', 'Warlock')})`,
  hybrid: hasFace(`mana_cost GLOB '*{[WUBRG2C]/[WUBRG]}*'`),
  // Phyrexian mana in the cost, or in the cost of an ability.
  phyrexian: `(o.mana_cost LIKE '%/P}%' OR o.oracle_all LIKE '%/P}%')`,
  // A printing property: compiled against `printings p` like s: and r:.
  promo: 'p.promo = 1',
}

/** `is:` values that describe a printing rather than the card. */
const PRINT_IS = new Set(['promo'])

function isHandler(negate: boolean): Handler {
  return (term) => {
    equalityOnly(term)
    const sql = own(IS, term.value.toLowerCase())
    if (!sql)
      throw new QuerySyntaxError('badValue', term.raw)
    return negate ? `NOT COALESCE(${sql}, 0)` : sql
  }
}

function gameHandler(term: Term): string {
  equalityOnly(term)
  // Only paper availability is stored; Arena and MTGO are not.
  if (term.value.toLowerCase() !== 'paper')
    throw new QuerySyntaxError('badValue', term.raw)
  return 'p.is_paper = 1'
}

function keywordHandler(term: Term, args: InValue[]): string {
  equalityOnly(term)
  // `keywords` is a JSON array: match one whole entry, quotes included.
  args.push(likeContains(`"${term.value.replace(/"/g, '')}"`))
  return `o.keywords LIKE ? ESCAPE '\\'`
}

const HANDLERS: Record<string, Handler> = {
  name: nameWords,
  t: textContains('o.type_line'),
  type: textContains('o.type_line'),
  o: oracleHandler,
  oracle: oracleHandler,
  fo: textContains('o.oracle_all'),
  fulloracle: textContains('o.oracle_all'),
  kw: keywordHandler,
  keyword: keywordHandler,
  c: colorHandler('o.colors_mask', '>='),
  color: colorHandler('o.colors_mask', '>='),
  colors: colorHandler('o.colors_mask', '>='),
  id: colorHandler('o.identity_mask', '<='),
  identity: colorHandler('o.identity_mask', '<='),
  ci: colorHandler('o.identity_mask', '<='),
  commander: colorHandler('o.identity_mask', '<='),
  produces: colorHandler('o.produced_mask', '>=', true),
  m: manaHandler,
  mana: manaHandler,
  eur: priceHandler,
  r: rarityHandler,
  rarity: rarityHandler,
  s: setHandler,
  set: setHandler,
  e: setHandler,
  edition: setHandler,
  a: textContains('p.artist'),
  artist: textContains('p.artist'),
  year: yearHandler,
  date: dateHandler,
  game: gameHandler,
  f: legalityHandler(['legal', 'restricted']),
  format: legalityHandler(['legal', 'restricted']),
  legal: legalityHandler(['legal', 'restricted']),
  banned: legalityHandler(['banned']),
  restricted: legalityHandler(['restricted']),
  is: isHandler(false),
  not: isHandler(true),
  ...Object.fromEntries(Object.entries(NUMERIC_ALIAS).map(([alias, field]) => [alias, numericHandler(field)])),
}

/** Keywords that describe a printing, compiled against `printings p`. */
const PRINT_KEYS = new Set(['r', 'rarity', 's', 'set', 'e', 'edition', 'a', 'artist', 'year', 'date', 'game'])

/** Real Scryfall keywords with no local data behind them. */
const UNSUPPORTED = new Set([
  'usd',
  'tix',
  'ft',
  'flavor',
  'wm',
  'watermark',
  'border',
  'frame',
  'stamp',
  'new',
  'cn',
  'number',
  'in',
  'st',
  'cube',
  'art',
  'atag',
  'arttag',
  'otag',
  'oracletag',
  'function',
  'devotion',
  'pt',
  'powtou',
  'def',
  'defense',
  'block',
  'b',
  'prints',
  'sets',
  'papersets',
  'paperprints',
  'cheapest',
  'has',
  'lore',
  'hand',
  'life',
])

/** Options that change how results are shown, not which cards match. */
const DISPLAY = new Set(['unique', 'prefer', 'display', 'dir', 'lang', 'language', 'include', 'order'])

const ORDERS: Record<string, SortOrder> = { edhrec: 'edhrec', name: 'name', cmc: 'cmc', mv: 'cmc', eur: 'eur' }

// ─── compiler ───────────────────────────────────────────────────────────────

/**
 * Drop what does not filter: display options, and values still being typed
 * (`t:` alone). Removing them from the tree, rather than compiling them to
 * TRUE, keeps `a or order:name` from matching every card.
 */
function prune(node: Node): Node | null {
  switch (node.kind) {
    case 'term': {
      const { key, value, exact } = node.term
      if (key && DISPLAY.has(key))
        return null
      if (!value)
        return null
      // A bare word with no letter or digit ("//", "~", ",") has nothing to
      // search for; left in, it made "fire // ice" match nothing.
      if ((key === null || key === 'name') && !exact && !/[\p{L}\p{N}]/u.test(value))
        return null
      return node
    }
    case 'not': {
      const inner = prune(node.node)
      return inner && { kind: 'not', node: inner }
    }
    default: {
      const nodes = node.nodes.map(prune).filter((n): n is Node => n !== null)
      if (!nodes.length)
        return null
      return nodes.length === 1 ? nodes[0]! : { kind: node.kind, nodes }
    }
  }
}

function findOrder(node: Node): SortOrder | null {
  switch (node.kind) {
    case 'term': {
      const { key, value, raw } = node.term
      if (key !== 'order' || !value)
        return null
      // An order we cannot apply is reported, like a filter: `order:usd`
      // silently sorted by popularity otherwise.
      const order = own(ORDERS, value.toLowerCase())
      if (!order)
        throw new QuerySyntaxError('badValue', raw)
      return order
    }
    case 'not':
      return null
    default:
      for (const n of node.nodes) {
        const found = findOrder(n)
        if (found)
          return found
      }
      return null
  }
}

function isPrintTerm(term: Term): boolean {
  if (term.exact || term.key === null)
    return false
  if (term.key === 'is' || term.key === 'not')
    return PRINT_IS.has(term.value.toLowerCase())
  return PRINT_KEYS.has(term.key)
}

function someTerm(node: Node, test: (term: Term) => boolean): boolean {
  switch (node.kind) {
    case 'term': return test(node.term)
    case 'not': return someTerm(node.node, test)
    default: return node.nodes.some(n => someTerm(n, test))
  }
}

function compileTerm(term: Term, args: InValue[]): string {
  if (term.exact)
    return exactName(term, args)
  if (term.key === null)
    return nameWords(term, args)
  const handler = own(HANDLERS, term.key)
  if (handler)
    return handler(term, args)
  throw new QuerySyntaxError(UNSUPPORTED.has(term.key) ? 'unsupportedKeyword' : 'unknownKeyword', term.raw)
}

// Args are pushed in the same left-to-right order the SQL text is built, so
// positional placeholders line up.
function compileNode(node: Node, args: InValue[]): string {
  switch (node.kind) {
    case 'term': return compileTerm(node.term, args)
    // COALESCE: a NULL inside must not make the negation NULL as well, which
    // would exclude the card either way.
    case 'not': return `NOT COALESCE(${compileNode(node.node, args)}, 0)`
    default: {
      if (!node.nodes.length)
        return '1'
      const parts = node.nodes.map(n => compileNode(n, args))
      return `(${parts.join(node.kind === 'and' ? ' AND ' : ' OR ')})`
    }
  }
}

const SET_KEYS = new Set(['s', 'set', 'e', 'edition'])

/**
 * Card-only parts become plain conditions on `o`. Every part that touches a
 * printing goes into ONE printings subquery, so its terms are all checked on
 * the same printing — card terms mixed in with them included.
 *
 * Three shapes, picked on measurements:
 *  - printing terms only: an uncorrelated subquery, run once from the set or
 *    rarity index;
 *  - mixed, with a set term at the top: the card is joined inside the
 *    subquery under the same alias `o`, which shadows the outer one, so the
 *    card conditions read unchanged and the set index drives — 1.5 ms where
 *    the correlated form took 204 ms;
 *  - mixed otherwise: correlated through the (oracle_id, lang) index. The
 *    joined form would walk every English printing (565 ms against 200 ms
 *    for a 40-term worst case).
 */
function compileRoot(root: Node, args: InValue[]): string {
  const conjuncts = root.kind === 'and' ? root.nodes : [root]
  const printing = conjuncts.filter(n => someTerm(n, isPrintTerm))
  const parts = conjuncts.filter(n => !printing.includes(n)).map(n => compileNode(n, args))
  if (printing.length) {
    const inner = printing.map(n => compileNode(n, args)).join(' AND ')
    const printOnly = printing.every(n => !someTerm(n, t => !isPrintTerm(t)))
    const bySet = printing.some(n => n.kind === 'term' && SET_KEYS.has(n.term.key ?? ''))
    if (printOnly)
      parts.push(`o.oracle_id IN (SELECT p.oracle_id FROM printings p WHERE p.lang = 'en' AND ${inner})`)
    else if (bySet)
      parts.push(`o.oracle_id IN (SELECT p.oracle_id FROM printings p JOIN oracle_cards o ON o.oracle_id = p.oracle_id WHERE p.lang = 'en' AND ${inner})`)
    else
      parts.push(`EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = o.oracle_id AND p.lang = 'en' AND ${inner})`)
  }
  return parts.length > 1 ? `(${parts.join(' AND ')})` : parts[0]!
}

export interface CompiledSyntax {
  /** A boolean SQL expression over `oracle_cards o`. */
  where: string
  args: InValue[]
  /** An `order:` found in the query, which overrides the caller's. */
  order: SortOrder | null
}

export function compileSyntax(text: string): CompiledSyntax {
  const tree = parse(tokenize(text.slice(0, MAX_LENGTH)))
  const pruned = prune(tree)
  const args: InValue[] = []
  return {
    where: pruned ? compileRoot(pruned, args) : '1',
    args,
    order: findOrder(tree),
  }
}

const ALL_KEYS = [...Object.keys(HANDLERS), ...UNSUPPORTED, ...DISPLAY]
const DETECT = new RegExp(`(?:^|[\\s(])-?(?:${ALL_KEYS.join('|')})(?:>=|<=|!=|[:=<>])`, 'i')

/**
 * Whether a search box entry is written in query syntax rather than being a
 * card name or rules text. Only known keywords count, so a name with a colon —
 * "Circle of Protection: Red", "Summon: Bahamut" — stays a plain search.
 */
export function isSyntaxQuery(text: string): boolean {
  const t = text.trim()
  return t.startsWith('!') || DETECT.test(t)
}
