/**
 * An imported file's rows matched to printings, in a handful of batched
 * queries: a printing id when the file has one (Scryfall's, Prism's), else the
 * set and collector number, else the name (English, or French as printed) in
 * the set named, newest printing first. The copy's language picks between the
 * English and French printings; a finish the printing lacks falls back to one
 * it has. What could not be matched, or had to be bent, says so.
 */
import type { Client, InValue } from '@libsql/client'
import type { CollectionCard, Finish } from '../../../shared/collection'
import type { ImportRow } from '../../../shared/collection-csv'
import type { GameId } from '../../../shared/game'
import { optcgPrintingId, parseOptcgPrintingId } from '../../../shared/collection'
import { useMtgCardsDb, useOptcgCardsDb } from '../cards/db'
import { fold } from '../cards/text'
import { collectionCards } from './cards'

const CHUNK = 400

/** Why a row was bent or left out (the client words it). */
export type ImportIssue = 'notFound' | 'otherLang' | 'noLangPrinting' | 'langKept' | 'setNotFound' | 'finishChanged'

export interface ResolvedImportRow {
  line: number
  printingId: string | null
  /** The copy's language, when the file gave one. */
  lang: 'fr' | 'en' | null
  finish: Finish
  quantity: number
  card: CollectionCard | null
  /** Left out: no card matched. */
  error: ImportIssue | null
  /** Imported, but not quite as written. */
  warnings: ImportIssue[]
}

const list = (n: number) => Array.from({ length: n }).fill('?').join(',')

async function chunked<T>(items: readonly string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < items.length; i += CHUNK)
    out.push(...await run(items.slice(i, i + CHUNK)))
  return out
}

interface Printing { id: string, oracleId: string, set: string, setName: string, number: string, lang: string, released: string }

function toPrinting(r: Record<string, unknown>): Printing {
  return {
    id: String(r.id),
    oracleId: String(r.oracle_id),
    set: String(r.set_code),
    setName: String(r.set_name ?? ''),
    number: String(r.collector_number),
    lang: String(r.lang),
    released: String(r.released_at ?? ''),
  }
}
const PRINTING_COLS = 'p.id, p.oracle_id, p.set_code, p.set_name, p.collector_number, p.lang, p.released_at'

/** The printing in the wanted language, else the other one (and says so). */
function inLang(candidates: Printing[], lang: 'fr' | 'en'): { p: Printing, switched: boolean } | null {
  const same = candidates.find(p => p.lang === lang)
  if (same)
    return { p: same, switched: false }
  const other = candidates[0]
  return other ? { p: other, switched: true } : null
}

async function mtgResolve(db: Client, rows: readonly ImportRow[]): Promise<Map<number, { id: string, warnings: ImportIssue[] }>> {
  const out = new Map<number, { id: string, warnings: ImportIssue[] }>()

  // 1. Printing ids.
  const ids = [...new Set(rows.map(r => r.printingId).filter(x => x != null))]
  const known = new Set((await chunked(ids, async c => (await db.execute({ sql: `SELECT id FROM printings WHERE id IN (${list(c.length)})`, args: c })).rows)).map(r => String(r.id)))
  for (const r of rows) {
    if (r.printingId && known.has(r.printingId))
      out.set(r.line, { id: r.printingId, warnings: [] })
  }

  // 2. Set and collector number.
  const pinned = rows.filter(r => !out.has(r.line) && r.set && r.number)
  const pins = [...new Set(pinned.map(r => `${r.set}|${r.number}`))]
  const bySetNumber = new Map<string, Printing[]>()
  for (const p of await chunked(pins, async (c) => {
    const where = c.map(() => '(p.set_code = ? AND p.collector_number = ?)').join(' OR ')
    const args = c.flatMap(k => k.split('|')) as InValue[]
    return (await db.execute({ sql: `SELECT ${PRINTING_COLS} FROM printings p WHERE p.lang IN ('en', 'fr') AND (${where})`, args })).rows.map(toPrinting)
  })) {
    const k = `${p.set}|${p.number}`
    bySetNumber.set(k, [...(bySetNumber.get(k) ?? []), p])
  }
  for (const r of pinned) {
    const hit = inLang(bySetNumber.get(`${r.set}|${r.number}`) ?? [], r.lang ?? 'en')
    if (hit)
      out.set(r.line, { id: hit.p.id, warnings: hit.switched ? ['noLangPrinting'] : [] })
  }

  // 3. Names: English (whole or front face), then French as printed.
  const named = rows.filter(r => !out.has(r.line) && r.name)
  const keys = [...new Set(named.map(r => fold(r.name!)))]
  const oracleOf = new Map<string, string>()
  for (const o of await chunked(keys, async c => (await db.execute({
    sql: `SELECT oracle_id, name_folded, name_front, is_extra, edhrec_sort FROM oracle_cards
           WHERE name_folded IN (${list(c.length)}) OR name_front IN (${list(c.length)})
           ORDER BY is_extra, edhrec_sort`,
    args: [...c, ...c],
  })).rows)) {
    for (const k of [String(o.name_folded), String(o.name_front)]) {
      if (!oracleOf.has(k))
        oracleOf.set(k, String(o.oracle_id))
    }
  }
  const french = named.map(r => r.name!.trim().toLowerCase()).filter(n => !oracleOf.has(fold(n)))
  for (const f of await chunked([...new Set(french)], async c => (await db.execute({
    sql: `SELECT DISTINCT oracle_id, lower(printed_name) AS n FROM printings WHERE lang = 'fr' AND lower(printed_name) IN (${list(c.length)})`,
    args: c,
  })).rows)) {
    if (!oracleOf.has(fold(String(f.n))))
      oracleOf.set(fold(String(f.n)), String(f.oracle_id))
  }

  const oracles = [...new Set(oracleOf.values())]
  const printingsOf = new Map<string, Printing[]>()
  for (const p of await chunked(oracles, async c => (await db.execute({
    // Without a set named, the newest printing of a regular set: the one
    // people most likely hold (not a Secret Lair, a List reprint — which
    // Scryfall files as masters — or a promo).
    sql: `SELECT ${PRINTING_COLS} FROM printings p LEFT JOIN sets s ON s.code = p.set_code
           WHERE p.lang IN ('en', 'fr') AND p.oracle_id IN (${list(c.length)})
           ORDER BY (s.set_type IN ('expansion', 'core', 'masters', 'draft_innovation', 'commander', 'starter') AND p.set_code NOT IN ('plst', 'list', 'mb1', 'mb2')) DESC, p.promo, p.released_at DESC, p.id`,
    args: c,
  })).rows.map(toPrinting))) {
    printingsOf.set(p.oracleId, [...(printingsOf.get(p.oracleId) ?? []), p])
  }
  for (const r of named) {
    const all = printingsOf.get(oracleOf.get(fold(r.name!)) ?? '') ?? []
    if (!all.length)
      continue
    const warnings: ImportIssue[] = []
    let pool = all
    if (r.set || r.setName) {
      const inSet = all.filter(p => (r.set && p.set === r.set) || (r.setName && p.setName.toLowerCase() === r.setName.toLowerCase()))
      if (inSet.length)
        pool = inSet
      else
        warnings.push('setNotFound')
    }
    const hit = inLang(pool, r.lang ?? 'en')!
    if (hit.switched)
      warnings.push('noLangPrinting')
    out.set(r.line, { id: hit.p.id, warnings })
  }
  return out
}

async function optcgResolve(db: Client, rows: readonly ImportRow[]): Promise<Map<number, { id: string, warnings: ImportIssue[] }>> {
  const out = new Map<number, { id: string, warnings: ImportIssue[] }>()
  // An art id, as Prism writes it ("fr:OP01-016_p1"), or a card number found
  // in any column ("OP01-016"): the number's base art, else its best one.
  const wanted = rows.map((r) => {
    const parsed = r.printingId ? parseOptcgPrintingId(r.printingId) : null
    const art = (parsed?.artId ?? [r.number, r.name, r.printingId].find(v => v && /^[A-Z]{1,3}\d{0,2}-\d{3}(?:_[pr]\d{1,2})?$/i.test(v.trim())) ?? '').trim().toUpperCase().replace(/_P/, '_p').replace(/_R/, '_r')
    return { r, art, lang: parsed?.lang ?? r.lang ?? 'fr' }
  })
  const arts = [...new Set(wanted.map(w => w.art).filter(Boolean))]
  const numbers = [...new Set(arts.map(a => a.split('_')[0]!))]
  const rowsByArt = new Map<string, Set<string>>()
  for (const c of await chunked([...arts, ...numbers], async ch => (await db.execute({ sql: `SELECT id, lang FROM op_cards WHERE id IN (${list(ch.length)})`, args: ch })).rows)) {
    const langs = rowsByArt.get(String(c.id)) ?? new Set<string>()
    langs.add(String(c.lang))
    rowsByArt.set(String(c.id), langs)
  }
  // A bare number means its usual printing in that language (op_best).
  const bare = [...new Set(wanted.filter(w => w.art && !w.art.includes('_')).map(w => w.art))]
  const best = new Map<string, { id: string, lang: string }>()
  for (const b of await chunked(bare, async ch => (await db.execute({ sql: `SELECT card_number, lang, id, row_lang FROM op_best WHERE card_number IN (${list(ch.length)})`, args: ch })).rows))
    best.set(`${String(b.card_number)}|${String(b.lang)}`, { id: String(b.id), lang: String(b.row_lang) })
  for (const w of wanted) {
    if (!w.art)
      continue
    const usual = !w.art.includes('_') ? best.get(`${w.art}|${w.lang}`) : undefined
    if (usual) {
      out.set(w.r.line, { id: optcgPrintingId(usual.lang as 'fr' | 'en', usual.id), warnings: usual.lang !== w.lang ? ['noLangPrinting'] : [] })
      continue
    }
    const art = rowsByArt.has(w.art) ? w.art : w.art.split('_')[0]!
    const langs = rowsByArt.get(art)
    if (!langs)
      continue
    const warnings: ImportIssue[] = art !== w.art ? ['setNotFound'] : []
    let lang = w.lang
    if (!langs.has(lang)) {
      lang = lang === 'fr' ? 'en' : 'fr'
      warnings.push('noLangPrinting')
    }
    out.set(w.r.line, { id: optcgPrintingId(lang as 'fr' | 'en', art), warnings })
  }
  return out
}

/** Each row, matched (or not), with its card for the preview. */
export async function resolveImport(game: GameId, rows: readonly ImportRow[]): Promise<ResolvedImportRow[]> {
  const matched = game === 'mtg' ? await mtgResolve(useMtgCardsDb(), rows) : await optcgResolve(useOptcgCardsDb(), rows)
  const cards = await collectionCards(game, [...new Set([...matched.values()].map(m => m.id))])
  return rows.map((r) => {
    const m = matched.get(r.line)
    const card = m ? cards.get(m.id) ?? null : null
    if (!m || !card)
      return { line: r.line, printingId: null, lang: r.lang, finish: r.finish, quantity: r.quantity, card: null, error: 'notFound', warnings: [] }
    // Magic: no printing in the copy's language means Scryfall lacks it, not
    // that the copy is not French; the copy keeps its language (a note, not a fix).
    const warnings = m.warnings.map(w => (w === 'noLangPrinting' && game === 'mtg' && r.lang ? 'langKept' as const : w))
    if (r.otherLang)
      warnings.push('otherLang')
    let finish = r.finish
    if (!card.finishes.includes(finish)) {
      finish = card.finishes[0] ?? 'nonfoil'
      warnings.push('finishChanged')
    }
    // Magic: a French copy of a printing only listed in English stays French.
    // One Piece carries the language in the printing itself.
    return { line: r.line, printingId: m.id, lang: game === 'mtg' ? r.lang : null, finish, quantity: r.quantity, card, error: null, warnings }
  })
}
