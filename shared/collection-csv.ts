/**
 * Collections in and out of files: the CSV exports of the usual apps
 * (ManaBox, Moxfield, Cardmarket, Delver Lens, Prism's own), a plain card list,
 * read into rows the server then matches to printings; and the collection
 * written back out in those formats.
 *
 * Reading goes by column names, not by app: each app's headers are aliases of
 * the same few fields, so an unknown CSV with sensible headers reads as well.
 */
import type { CollectionCopy, Condition, Finish } from './collection'
import { MAX_COPIES } from './collection'

export const IMPORT_MAX_ROWS = 5000

export type ImportFormat = 'prism' | 'manabox' | 'moxfield' | 'cardmarket' | 'delver' | 'csv' | 'text' | 'precon' | 'deck'
export type ExportFormat = 'prism' | 'manabox' | 'moxfield' | 'text'

/** One line of a file, read: what identifies the card, and the copies. */
export interface ImportRow {
  /** Line in the file (1 is the first data line after the header). */
  line: number
  name: string | null
  /** Set code as the file gives it (Scryfall's for most apps). */
  set: string | null
  setName: string | null
  number: string | null
  /** A printing id: Scryfall's (Magic), or Prism's own. */
  printingId: string | null
  lang: 'fr' | 'en' | null
  /** A language the site does not carry, as the file wrote it. */
  otherLang: string | null
  finish: Finish
  condition: Condition
  quantity: number
  purchasePrice: number | null
  location: string | null
  note: string | null
}

export interface ParsedImport {
  format: ImportFormat
  rows: ImportRow[]
  /** Lines that could not be read, with why. */
  errors: { line: number, message: string }[]
  /** More lines than one import takes. */
  truncated: boolean
}

// ---- CSV ----------------------------------------------------------------

/** The delimiter of a CSV, by what its first line holds most of. */
function delimiterOf(firstLine: string): string {
  let best = ','
  let most = -1
  for (const d of [',', ';', '\t']) {
    let n = 0
    let quoted = false
    for (const ch of firstLine) {
      if (ch === '"')
        quoted = !quoted
      else if (ch === d && !quoted)
        n++
    }
    if (n > most) {
      most = n
      best = d
    }
  }
  return best
}

/** RFC 4180 records: quoted fields may hold the delimiter, quotes ("") and line breaks. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const d = delimiter ?? delimiterOf(src.split(/\r?\n/, 1)[0] ?? '')
  const out: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      }
      else if (ch === '"') {
        quoted = false
      }
      else {
        field += ch
      }
    }
    else if (ch === '"' && field === '') {
      quoted = true
    }
    else if (ch === d) {
      row.push(field)
      field = ''
    }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n')
        i++
      row.push(field)
      out.push(row)
      row = []
      field = ''
    }
    else {
      field += ch
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    out.push(row)
  }
  return out.filter(r => r.some(f => f.trim() !== ''))
}

/** "Collector's Number" → "collector s number": headers compared loosely. */
function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

type Field = 'quantity' | 'name' | 'set' | 'setName' | 'number' | 'printingId' | 'scryfallId' | 'lang' | 'finish' | 'condition' | 'purchasePrice' | 'location' | 'note'

const ALIASES: Record<Field, string[]> = {
  quantity: ['quantity', 'count', 'qty', 'amount', 'quantite', 'nombre', 'qte', 'copies'],
  name: ['name', 'card name', 'card', 'english name', 'nom', 'carte'],
  set: ['set code', 'set', 'edition', 'edition code', 'expansion code', 'setcode', 'code', 'extension'],
  setName: ['set name', 'exp name', 'expansion', 'expansion name', 'edition name', 'nom de l extension'],
  number: ['collector number', 'collector s number', 'collectors number', 'card number', 'number', 'cn', 'no', 'numero', 'num'],
  printingId: ['printing id', 'prism id'],
  scryfallId: ['scryfall id', 'scryfallid', 'scryfall uuid'],
  lang: ['language', 'lang', 'langue'],
  finish: ['finish', 'foil', 'printing', 'finition', 'is foil', 'foil etched'],
  condition: ['condition', 'etat', 'state', 'cond'],
  purchasePrice: ['purchase price', 'prix d achat', 'acquisition price', 'price bought', 'buy price', 'paid'],
  location: ['location', 'binder', 'binder name', 'emplacement', 'list name'],
  note: ['note', 'notes', 'comment', 'comments'],
}

function columnsOf(headers: string[]): Partial<Record<Field, number>> {
  const normalized = headers.map(norm)
  const out: Partial<Record<Field, number>> = {}
  for (const [field, names] of Object.entries(ALIASES) as [Field, string[]][]) {
    const i = names.map(n => normalized.indexOf(n)).find(i => i >= 0)
    if (i != null)
      out[field] = i
  }
  return out
}

function formatOf(headers: string[]): ImportFormat {
  const h = new Set(headers.map(norm))
  if (h.has('manabox id'))
    return 'manabox'
  if (h.has('tradelist count'))
    return 'moxfield'
  if (h.has('idproduct') || h.has('idarticle') || h.has('product id'))
    return 'cardmarket'
  if (h.has('printing id'))
    return 'prism'
  if (h.has('reverse') || h.has('delver id'))
    return 'delver'
  return 'csv'
}

const CONDITION_WORDS: [RegExp, Condition][] = [
  [/^(m|mint|mt)$/, 'M'],
  [/^(nm|near ?mint|nm m)$/, 'NM'],
  [/^(ex|excellent|slightly played|sp)$/, 'EX'],
  [/^(gd|good|gd gd)$/, 'GD'],
  [/^(lp|light ?ly ?played|light played)$/, 'LP'],
  [/^(pl|played|moderately played|mp|heavily played|hp)$/, 'PL'],
  [/^(po|poor|damaged|dmg)$/, 'PO'],
]

/** "near_mint", "Near Mint", "NM", "Lightly Played"… → Cardmarket's scale. */
export function conditionOf(value: string): Condition | null {
  const v = norm(value)
  if (!v)
    return null
  return CONDITION_WORDS.find(([re]) => re.test(v))?.[1] ?? null
}

/** "foil", "etched", "normal", "x", "true"… → a finish. */
export function finishOf(value: string): Finish | null {
  const v = norm(value)
  if (!v || ['normal', 'nonfoil', 'non foil', 'no', 'false', '0', 'regular', 'non'].includes(v))
    return v ? 'nonfoil' : null
  if (v.includes('etched'))
    return 'etched'
  if (['foil', 'x', 'yes', 'true', '1', 'oui', 'holo', 'premium'].includes(v) || v.includes('foil'))
    return 'foil'
  return null
}

// Cardmarket numbers its languages: 1 English, 2 French.
const LANG_CODES: Record<string, 'fr' | 'en'> = { en: 'en', english: 'en', anglais: 'en', 1: 'en', fr: 'fr', french: 'fr', francais: 'fr', 2: 'fr' }

function langOf(value: string): { lang: 'fr' | 'en' | null, other: string | null } {
  const v = norm(value)
  if (!v)
    return { lang: null, other: null }
  const lang = LANG_CODES[v]
  return lang ? { lang, other: null } : { lang: null, other: value.trim() }
}

function priceOf(value: string): number | null {
  const v = value.replace(/[€$\s]/g, '').replace(',', '.')
  if (!v)
    return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n < 1e6 ? n : null
}

const text = (v: string | undefined) => (v?.trim() ? v.trim() : null)

function readCsv(records: string[][]): ParsedImport {
  const [headers = [], ...data] = records
  const cols = columnsOf(headers)
  const format = formatOf(headers)
  const rows: ImportRow[] = []
  const errors: ParsedImport['errors'] = []
  const at = (r: string[], f: Field) => (cols[f] == null ? undefined : r[cols[f]!])
  data.forEach((r, i) => {
    const line = i + 1
    const qRaw = at(r, 'quantity')
    const quantity = qRaw == null || qRaw.trim() === '' ? 1 : Number(qRaw.trim())
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_COPIES) {
      errors.push({ line, message: `quantity:${qRaw}` })
      return
    }
    if (quantity === 0)
      return
    const name = text(at(r, 'name'))
    const printingId = text(at(r, 'printingId')) ?? text(at(r, 'scryfallId'))
    const number = text(at(r, 'number'))
    if (!name && !printingId && !number) {
      errors.push({ line, message: 'noCard' })
      return
    }
    const { lang, other } = langOf(at(r, 'lang') ?? '')
    rows.push({
      line,
      name,
      set: text(at(r, 'set'))?.toLowerCase() ?? null,
      setName: text(at(r, 'setName')),
      number,
      printingId,
      lang,
      otherLang: other,
      finish: finishOf(at(r, 'finish') ?? '') ?? 'nonfoil',
      condition: conditionOf(at(r, 'condition') ?? '') ?? 'NM',
      quantity,
      purchasePrice: priceOf(at(r, 'purchasePrice') ?? ''),
      location: text(at(r, 'location'))?.slice(0, 80) ?? null,
      note: text(at(r, 'note'))?.slice(0, 500) ?? null,
    })
  })
  return { format, rows, errors, truncated: false }
}

// ---- Plain lists ------------------------------------------------------------

/**
 * One line of a card list: "4 Sol Ring", "4x Sol Ring (CMM) 400",
 * "1 Sol Ring (cmm) 400 *F*", "4x OP01-016". Read piece by piece from both ends.
 */
function listLine(line: string): { quantity: number, name: string, set: string | null, number: string | null, finish: Finish } {
  let s = line
  let finish: Finish = 'nonfoil'
  const flag = s.slice(-4).toUpperCase()
  if (flag === ' *F*' || flag === ' *E*') {
    finish = flag === ' *E*' ? 'etched' : 'foil'
    s = s.slice(0, -4).trimEnd()
  }
  let quantity = 1
  const head = /^(\d+)x?\s/i.exec(s)
  if (head) {
    quantity = Number(head[1])
    s = s.slice(head[0].length).trim()
  }
  let set: string | null = null
  let number: string | null = null
  const open = s.lastIndexOf(' (')
  const close = s.indexOf(')', open)
  if (open > 0 && close > open) {
    const code = s.slice(open + 2, close)
    const tail = s.slice(close + 1).trim()
    if (/^[a-z0-9]{2,8}$/i.test(code) && !/\s/.test(tail)) {
      set = code.toLowerCase()
      number = tail || null
      s = s.slice(0, open).trim()
    }
  }
  return { quantity, name: s, set, number, finish }
}

function readList(lines: string[]): ParsedImport {
  const rows: ImportRow[] = []
  const errors: ParsedImport['errors'] = []
  lines.forEach((raw, i) => {
    const line = i + 1
    const s = raw.trim()
    if (!s || /^(?:\/\/|#)/.test(s) || /^(?:deck|sideboard|commander|companion|maybeboard)\b/i.test(s))
      return
    const { quantity, name, set, number, finish } = listLine(s)
    if (!name || quantity < 1 || quantity > MAX_COPIES) {
      errors.push({ line, message: 'unreadable' })
      return
    }
    rows.push({
      line,
      name,
      set,
      setName: null,
      number,
      printingId: null,
      lang: null,
      otherLang: null,
      finish,
      condition: 'NM',
      quantity,
      purchasePrice: null,
      location: null,
      note: null,
    })
  })
  return { format: 'text', rows, errors, truncated: false }
}

/** A file's text, read as a CSV (a header naming its columns) or a card list. */
export function parseImport(input: string): ParsedImport {
  const firstLine = input.replace(/^\uFEFF/, '').split(/\r?\n/).find(l => l.trim()) ?? ''
  const headers = parseCsv(firstLine)[0] ?? []
  const cols = columnsOf(headers)
  const isCsv = headers.length > 1 && (cols.name != null || cols.printingId != null || cols.scryfallId != null || cols.number != null)
  const parsed = isCsv ? readCsv(parseCsv(input)) : readList(input.split(/\r?\n/))
  if (parsed.rows.length > IMPORT_MAX_ROWS)
    return { ...parsed, rows: parsed.rows.slice(0, IMPORT_MAX_ROWS), truncated: true }
  return parsed
}

// ---- Export -----------------------------------------------------------------

function csvField(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map(r => r.map(csvField).join(',')).join('\r\n')
}

const MANABOX_CONDITION: Record<Condition, string> = { M: 'mint', NM: 'near_mint', EX: 'excellent', GD: 'good', LP: 'light_played', PL: 'played', PO: 'poor' }
const MOXFIELD_CONDITION: Record<Condition, string> = { M: 'Mint', NM: 'Near Mint', EX: 'Near Mint', GD: 'Lightly Played', LP: 'Lightly Played', PL: 'Moderately Played', PO: 'Damaged' }
const LANG_NAME: Record<string, string> = { en: 'English', fr: 'French' }

/** The collection as a file of one of the formats other apps read back. */
export function exportCollection(copies: readonly CollectionCopy[], format: ExportFormat): string {
  const known = copies.filter(c => c.card)
  switch (format) {
    case 'manabox':
      return csv(
        ['Name', 'Set code', 'Set name', 'Collector number', 'Foil', 'Rarity', 'Quantity', 'Scryfall ID', 'Purchase price', 'Condition', 'Language', 'Purchase price currency'],
        known.map(c => [c.card!.name, c.card!.set.toUpperCase(), c.card!.setName ?? '', c.card!.number, c.finish === 'nonfoil' ? 'normal' : c.finish, c.card!.rarity ?? '', c.quantity, c.printingId, c.purchasePrice ?? '', MANABOX_CONDITION[c.condition], c.card!.lang, 'EUR']),
      )
    case 'moxfield':
      return csv(
        ['Count', 'Tradelist Count', 'Name', 'Edition', 'Condition', 'Language', 'Foil', 'Tags', 'Last Modified', 'Collector Number', 'Alter', 'Proxy', 'Purchase Price'],
        known.map(c => [c.quantity, 0, c.card!.name, c.card!.set, MOXFIELD_CONDITION[c.condition], LANG_NAME[c.card!.lang] ?? 'English', c.finish === 'nonfoil' ? '' : c.finish, '', '', c.card!.number, 'False', 'False', c.purchasePrice ?? '']),
      )
    case 'text':
      return known.map(c => c.game === 'optcg'
        ? `${c.quantity}x ${c.card!.number}`
        : `${c.quantity} ${c.card!.name} (${c.card!.set.toUpperCase()}) ${c.card!.number}${c.finish === 'foil' ? ' *F*' : c.finish === 'etched' ? ' *E*' : ''}`).join('\n')
    default:
      return csv(
        ['Printing ID', 'Name', 'Set code', 'Set name', 'Collector number', 'Language', 'Finish', 'Condition', 'Quantity', 'Purchase price', 'Location', 'Note'],
        known.map(c => [c.printingId, c.card!.name, c.card!.set, c.card!.setName ?? '', c.card!.number, c.card!.lang, c.finish, c.condition, c.quantity, c.purchasePrice ?? '', c.location ?? '', c.note ?? '']),
      )
  }
}
