/**
 * How far a collection goes into each set: the distinct cards owned against
 * the set's size (any language, finish or condition counts), and a set's
 * checklist with what is owned of each card.
 *
 * A card is a collector number for Magic (each art its own number, as the set
 * lists them) and a card number for One Piece (its alternate arts are the same
 * card).
 */
import type { Client, InValue } from '@libsql/client'
import type { ChecklistCard, SetProgress } from '../../../shared/collection'
import type { GameId } from '../../../shared/game'
import { parseOptcgPrintingId } from '../../../shared/collection'
import { useMtgCardsDb, useOptcgCardsDb } from '../cards/db'
import { imageUrl, setIconPath } from '../cards/mtg-shape'
import { optcgImageUrl } from '../cards/optcg-shape'

const CHUNK = 400

/** What a copy line needs here: its printing and how many. */
export interface OwnedLine {
  printingId: string
  quantity: number
}

/** Sets nobody collects in a binder: tokens, art series, digital-only ones. */
const MTG_UNLISTED_TYPES = ['token', 'memorabilia', 'minigame', 'alchemy', 'treasure_chest', 'vanguard']

async function inChunks<T>(ids: readonly string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK)
    out.push(...await run(ids.slice(i, i + CHUNK)))
  return out
}

const placeholders = (n: number) => Array.from({ length: n }).fill('?').join(',')

/** Each owned printing's set and card key (Magic: collector number). */
async function mtgKeys(db: Client, ids: readonly string[]) {
  const rows = await inChunks(ids, async chunk => (await db.execute({
    sql: `SELECT id, set_code, collector_number FROM printings WHERE id IN (${placeholders(chunk.length)})`,
    args: chunk as InValue[],
  })).rows)
  return new Map(rows.map(r => [String(r.id), { set: String(r.set_code), key: String(r.collector_number) }]))
}

/** Each owned printing's set and card key (One Piece: card number). */
async function optcgKeys(db: Client, ids: readonly string[]) {
  const arts = [...new Set(ids.map(id => parseOptcgPrintingId(id)?.artId).filter(x => x != null))]
  const rows = await inChunks(arts, async chunk => (await db.execute({
    sql: `SELECT DISTINCT c.id, n.card_number, n.set_code FROM op_cards c
            JOIN op_numbers n ON n.card_number = c.card_number
           WHERE c.id IN (${placeholders(chunk.length)})`,
    args: chunk as InValue[],
  })).rows)
  const byArt = new Map(rows.map(r => [String(r.id), { set: String(r.set_code ?? ''), key: String(r.card_number) }]))
  const out = new Map<string, { set: string, key: string }>()
  for (const id of ids) {
    const hit = byArt.get(parseOptcgPrintingId(id)?.artId ?? '')
    if (hit?.set)
      out.set(id, hit)
  }
  return out
}

/** Copies owned of each card of each set: set → card key → quantity. */
export async function ownedBySet(game: GameId, lines: readonly OwnedLine[]): Promise<Map<string, Map<string, number>>> {
  const ids = [...new Set(lines.map(l => l.printingId))]
  const keys = game === 'mtg' ? await mtgKeys(useMtgCardsDb(), ids) : await optcgKeys(useOptcgCardsDb(), ids)
  const out = new Map<string, Map<string, number>>()
  for (const l of lines) {
    const k = keys.get(l.printingId)
    if (!k)
      continue
    const cards = out.get(k.set) ?? new Map<string, number>()
    cards.set(k.key, (cards.get(k.key) ?? 0) + l.quantity)
    out.set(k.set, cards)
  }
  return out
}

const OPTCG_KIND_ORDER = ['OP', 'EB', 'PRB', 'ST', 'P']

/** One Piece sets as their list reads: boosters newest first, then extra and premium boosters, starters, promos. */
export function optcgSetOrder(a: string, b: string): number {
  const key = (code: string) => {
    const [kind = '', num = '0'] = code.split('-')
    const rank = OPTCG_KIND_ORDER.indexOf(kind)
    return [rank === -1 ? OPTCG_KIND_ORDER.length : rank, -Number(num)] as const
  }
  const [ka, na] = key(a)
  const [kb, nb] = key(b)
  return ka - kb || na - nb
}

/** "BOOSTER PACK -ROMANCE DAWN- [OP-01]" → "ROMANCE DAWN". */
export function optcgSetName(title: unknown, code: string): string {
  const m = typeof title === 'string' ? /-(.+)-\s*\[/.exec(title) : null
  return m?.[1]?.trim() || code
}

async function mtgSets(owned: Map<string, Map<string, number>>, all: boolean): Promise<SetProgress[]> {
  const codes = [...owned.keys()]
  if (!all && !codes.length)
    return []
  // Every set: the ones people collect, and whatever else is owned.
  const listed = `(s.cards > 0 AND s.digital = 0 AND s.set_type NOT IN (${placeholders(MTG_UNLISTED_TYPES.length)}))`
  const started = codes.length ? `s.code IN (${placeholders(codes.length)})` : '0'
  const { rows } = await useMtgCardsDb().execute({
    sql: `SELECT s.code, s.name, s.released_at, s.set_type, s.icon, s.cards FROM sets s
           WHERE ${all ? `${listed} OR ${started}` : started}
           ORDER BY s.released_at DESC, s.name`,
    args: (all ? [...MTG_UNLISTED_TYPES, ...codes] : codes) as InValue[],
  })
  return rows.map((r) => {
    const code = String(r.code)
    const total = Number(r.cards ?? 0)
    return {
      code,
      name: String(r.name),
      icon: setIconPath(r.icon),
      releasedAt: r.released_at == null ? null : String(r.released_at),
      type: r.set_type == null ? null : String(r.set_type),
      total,
      // Numbers the English list does not have (rare) cannot overflow the set.
      owned: Math.min(total, owned.get(code)?.size ?? 0),
    }
  })
}

async function optcgSets(owned: Map<string, Map<string, number>>, all: boolean, lang: 'fr' | 'en'): Promise<SetProgress[]> {
  const { rows } = await useOptcgCardsDb().execute({
    sql: `SELECT n.set_code AS code, COUNT(*) AS cards,
                 (SELECT p.title FROM op_packs p WHERE p.label = n.set_code ORDER BY (p.lang = ?) DESC LIMIT 1) AS title
            FROM op_numbers n
           WHERE n.set_code IS NOT NULL
           GROUP BY n.set_code`,
    args: [lang],
  })
  return rows
    .filter(r => all || owned.has(String(r.code)))
    .map((r) => {
      const code = String(r.code)
      const total = Number(r.cards)
      return { code, name: optcgSetName(r.title, code), icon: null, releasedAt: null, type: code.split('-')[0] ?? null, total, owned: Math.min(total, owned.get(code)?.size ?? 0) }
    })
    .sort((a, b) => optcgSetOrder(a.code, b.code))
}

/** The sets a collection has started (or every set, with `all`). */
export async function setProgress(game: GameId, lines: readonly OwnedLine[], opts: { all: boolean, lang: 'fr' | 'en' }): Promise<SetProgress[]> {
  const owned = await ownedBySet(game, lines)
  return game === 'mtg' ? mtgSets(owned, opts.all) : optcgSets(owned, opts.all, opts.lang)
}

/** "12", "12a", "★12": by the number first, then as text. */
function byNumber(a: string, b: string): number {
  const na = Number.parseInt(a.replace(/^\D+/, ''), 10)
  const nb = Number.parseInt(b.replace(/^\D+/, ''), 10)
  return (Number.isNaN(na) ? Infinity : na) - (Number.isNaN(nb) ? Infinity : nb) || a.localeCompare(b)
}

async function mtgChecklist(code: string, lang: 'fr' | 'en'): Promise<ChecklistCard[]> {
  // One row per collector number: the site's language when printed in it,
  // else English.
  const { rows } = await useMtgCardsDb().execute({
    sql: `SELECT p.id, p.lang, p.collector_number, p.rarity, p.printed_name, p.img_version, o.name,
                 (SELECT f.img_version FROM card_faces f WHERE f.printing_id = p.id AND f.face_index = 0) AS face_img
            FROM printings p
            JOIN oracle_cards o ON o.oracle_id = p.oracle_id
           WHERE p.set_code = ? AND p.lang IN ('en', ?)
           ORDER BY p.lang = ? DESC`,
    args: [code, lang, lang],
  })
  const byNum = new Map<string, ChecklistCard>()
  for (const r of rows) {
    const number = String(r.collector_number)
    if (byNum.has(number))
      continue
    const id = String(r.id)
    byNum.set(number, {
      key: number,
      number,
      name: String(r.name),
      printedName: r.printed_name == null ? null : String(r.printed_name),
      rarity: r.rarity == null ? null : String(r.rarity),
      thumb: imageUrl('normal', 'front', id, r.img_version ?? r.face_img, 'thumb'),
      printingId: id,
      owned: 0,
    })
  }
  return [...byNum.values()].sort((a, b) => byNumber(a.number, b.number))
}

async function optcgChecklist(code: string, lang: 'fr' | 'en'): Promise<ChecklistCard[]> {
  const { rows } = await useOptcgCardsDb().execute({
    sql: `SELECT n.card_number, c.id, c.lang, c.name, c.rarity, c.img_version
            FROM op_numbers n
            JOIN op_best b ON b.card_number = n.card_number AND b.lang = ?
            JOIN op_cards c ON c.id = b.id AND c.lang = b.row_lang
           WHERE n.set_code = ?
           ORDER BY n.card_number`,
    args: [lang, code],
  })
  return rows.map(r => ({
    key: String(r.card_number),
    number: String(r.card_number),
    name: String(r.name),
    printedName: null,
    rarity: r.rarity == null ? null : String(r.rarity),
    thumb: optcgImageUrl(String(r.lang), String(r.id), r.img_version, 'thumb'),
    printingId: `${String(r.lang)}:${String(r.id)}`,
    owned: 0,
  }))
}

/** A set's cards in order, with how many of each the collection holds. */
export async function setChecklist(game: GameId, code: string, lines: readonly OwnedLine[], lang: 'fr' | 'en'): Promise<ChecklistCard[]> {
  const cards = game === 'mtg' ? await mtgChecklist(code, lang) : await optcgChecklist(code, lang)
  const owned = (await ownedBySet(game, lines)).get(code)
  for (const c of cards)
    c.owned = owned?.get(c.key) ?? 0
  return cards
}

/** A set's name and symbol, its progress read from its checklist. */
export async function checklistSet(game: GameId, code: string, cards: readonly ChecklistCard[], lang: 'fr' | 'en'): Promise<SetProgress | null> {
  const total = cards.length
  const owned = cards.filter(c => c.owned > 0).length
  if (game === 'optcg') {
    const { rows } = await useOptcgCardsDb().execute({ sql: 'SELECT title FROM op_packs WHERE label = ? ORDER BY (lang = ?) DESC LIMIT 1', args: [code, lang] })
    return total ? { code, name: optcgSetName(rows[0]?.title, code), icon: null, releasedAt: null, type: code.split('-')[0] ?? null, total, owned } : null
  }
  const { rows } = await useMtgCardsDb().execute({ sql: 'SELECT name, released_at, set_type, icon FROM sets WHERE code = ?', args: [code] })
  const r = rows[0]
  return r
    ? { code, name: String(r.name), icon: setIconPath(r.icon), releasedAt: r.released_at == null ? null : String(r.released_at), type: r.set_type == null ? null : String(r.set_type), total, owned }
    : null
}
