/**
 * The collection's adapter for the generic engine's games (server/utils/tcg):
 * one implementation, read against each game's database.
 *
 * A printing is the same card in both languages (the same id), so the copy's
 * language is part of its printing id, as for One Piece: `fr:sv03.5-006`.
 * Completion counts a card by its number within its set, as for Magic.
 * Finishes: the collection's three stand for the game's own — Pokémon's
 * normal, holo and reverse holo (collection.finish.<game>.* in the locales).
 */
import type { InValue, Row } from '@libsql/client'
import type { ChecklistCard, CollectionCard, Finish, SetProgress } from '../../../shared/collection'
import type { ImportRow } from '../../../shared/collection-csv'
import type { TcgGameId } from '../../../shared/tcg/types'
import type { GameCollection, Lang } from './games'
import type { ImportIssue } from './import'
import { optcgPrintingId, parseOptcgPrintingId } from '../../../shared/collection'
import { FINISH_BIT } from '../../../shared/tcg/types'
import { fold } from '../cards/text'
import { useTcgDb } from '../tcg/db'
import { tcgImageUrl } from '../tcg/query'

const CHUNK = 400
const marks = (n: number) => Array.from({ length: n }).fill('?').join(',')

/** The collection's finishes a printing exists in, from the game's. */
function finishesOf(mask: unknown): Finish[] {
  const m = Number(mask ?? 1) || 1
  const out: Finish[] = []
  if (m & (FINISH_BIT.normal | FINISH_BIT.firstEdition))
    out.push('nonfoil')
  if (m & FINISH_BIT.holo)
    out.push('foil')
  if (m & FINISH_BIT.reverse)
    out.push('etched')
  return out.length ? out : ['nonfoil']
}

async function chunked<T>(items: readonly string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < items.length; i += CHUNK)
    out.push(...await run(items.slice(i, i + CHUNK)))
  return out
}

/** A set's family (shared/collection SET_KINDS_BY_GAME), from its code. */
export function tcgSetType(code: string): string {
  if (/^(?:mcd|tk-)/.test(code))
    return 'starter'
  if (/p$|^p-|promo|^(?:pr|jdg)$/i.test(code))
    return 'promo'
  return 'expansion'
}

/** The row per id in the wanted language, else the other one. */
function pick(rows: readonly Row[], lang: Lang): Map<string, Row> {
  const out = new Map<string, Row>()
  for (const r of rows) {
    const id = String(r.id)
    if (!out.has(id) || r.lang === lang)
      out.set(id, r)
  }
  return out
}

const CARD_SQL = `SELECT c.id, c.lang, c.name, c.name_en, c.number, c.set_code, c.rarity, c.category, c.subtype,
                         c.types, c.image, c.thumb, c.finishes, c.price_eur, c.price_eur_foil,
                         s.name AS set_name, s.symbol, s.released
                    FROM cards c LEFT JOIN sets s ON s.code = c.set_code AND s.lang = c.lang`

export function tcgCollection(game: TcgGameId): GameCollection {
  const db = () => useTcgDb(game)
  const image = (v: unknown) => tcgImageUrl(game, v) ?? ''

  async function cards(printingIds: readonly string[]): Promise<Map<string, CollectionCard>> {
    const wanted = printingIds.map(parseOptcgPrintingId).filter(x => x != null)
    const rows = await chunked([...new Set(wanted.map(w => w.artId))], async ch => (await db().execute({ sql: `${CARD_SQL} WHERE c.id IN (${marks(ch.length)})`, args: ch })).rows)
    const byLang = { fr: pick(rows, 'fr'), en: pick(rows, 'en') }
    const out = new Map<string, CollectionCard>()
    for (const w of wanted) {
      const r = byLang[w.lang].get(w.artId)
      if (!r)
        continue
      const name = String(r.name)
      out.set(`${w.lang}:${w.artId}`, {
        // English: what decks and the collection match on (shared/collection ownershipKey).
        name: r.name_en == null ? name : String(r.name_en),
        printedName: r.name_en != null && r.name_en !== r.name ? name : null,
        lang: w.lang,
        set: String(r.set_code),
        setName: r.set_name == null ? null : String(r.set_name),
        setIcon: tcgImageUrl(game, r.symbol),
        number: String(r.number),
        rarity: r.rarity == null ? null : String(r.rarity),
        releasedAt: r.released == null ? null : String(r.released),
        typeLine: [r.category, r.subtype].filter(Boolean).join(' — '),
        colors: JSON.parse(String(r.types ?? '[]')),
        manaCost: null,
        image: image(r.image),
        thumb: r.thumb && r.thumb !== r.image ? image(r.thumb) : image(r.image) && `${image(r.image)}?size=thumb`,
        price: r.price_eur == null ? null : Number(r.price_eur),
        priceFoil: r.price_eur_foil == null ? null : Number(r.price_eur_foil),
        finishes: finishesOf(r.finishes),
      })
    }
    return out
  }

  async function keys(printingIds: readonly string[]) {
    const ids = [...new Set(printingIds.map(id => parseOptcgPrintingId(id)?.artId).filter(x => x != null))]
    const rows = await chunked(ids, async ch => (await db().execute({ sql: `SELECT DISTINCT id, set_code, number FROM cards WHERE id IN (${marks(ch.length)})`, args: ch })).rows)
    const byId = new Map(rows.map(r => [String(r.id), { set: String(r.set_code), key: String(r.number) }]))
    const out = new Map<string, { set: string, key: string }>()
    for (const id of printingIds) {
      const hit = byId.get(parseOptcgPrintingId(id)?.artId ?? '')
      if (hit)
        out.set(id, hit)
    }
    return out
  }

  async function sets(owned: Map<string, Map<string, number>>, all: boolean, lang: Lang): Promise<SetProgress[]> {
    const { rows } = await db().execute({
      // A set's symbol may only be known in one language.
      sql: `SELECT s.code, s.name, s.released,
                   (SELECT o.symbol FROM sets o WHERE o.code = s.code AND o.symbol IS NOT NULL LIMIT 1) AS symbol,
                   (SELECT COUNT(DISTINCT c.number) FROM cards c WHERE c.set_code = s.code) AS cards
              FROM sets s
             WHERE s.lang = ? OR NOT EXISTS (SELECT 1 FROM sets o WHERE o.code = s.code AND o.lang = ?)
             ORDER BY s.released DESC, s.code`,
      args: [lang, lang],
    })
    return rows
      .filter(r => all || owned.has(String(r.code)))
      .map((r) => {
        const code = String(r.code)
        const total = Number(r.cards)
        return {
          code,
          name: String(r.name),
          icon: tcgImageUrl(game, r.symbol),
          art: null,
          releasedAt: r.released == null ? null : String(r.released),
          type: tcgSetType(code),
          total,
          owned: Math.min(total, owned.get(code)?.size ?? 0),
        }
      })
      .filter(s => s.total > 0)
  }

  async function checklist(code: string, lang: Lang): Promise<ChecklistCard[]> {
    const { rows } = await db().execute({ sql: `${CARD_SQL} WHERE c.set_code = ?`, args: [code] })
    const shown = pick(rows, lang)
    const has = new Set(rows.map(r => `${String(r.id)}|${String(r.lang)}`))
    const printingsOf = (id: string) => ({ fr: has.has(`${id}|fr`) ? `fr:${id}` : null, en: has.has(`${id}|en`) ? `en:${id}` : null })
    // A number printed in several rarities is one pocket: its base printing
    // (the id without a rarity suffix) shows, the others are its variants.
    const byNumber = new Map<string, Row[]>()
    for (const r of shown.values()) {
      const list = byNumber.get(String(r.number)) ?? []
      list.push(r)
      byNumber.set(String(r.number), list)
    }
    const out = [...byNumber.values()].map((group) => {
      const base = group.find(r => String(r.id) === `${code}-${String(r.number)}`) ?? group[0]!
      const r = base
      const id = String(r.id)
      const variants = group.length > 1
        ? [base, ...group.filter(g => g !== base)].map(g => ({ rarity: g.rarity == null ? null : String(g.rarity), printings: printingsOf(String(g.id)), owned: 0 }))
        : undefined
      return {
        ...(variants ? { variants } : {}),
        key: String(r.number),
        number: String(r.number),
        name: r.name_en == null ? String(r.name) : String(r.name_en),
        printedName: r.name_en != null && r.name_en !== r.name ? String(r.name) : null,
        rarity: r.rarity == null ? null : String(r.rarity),
        thumb: r.thumb && r.thumb !== r.image ? image(r.thumb) : image(r.image) && `${image(r.image)}?size=thumb`,
        printingId: optcgPrintingId(r.lang === 'fr' ? 'fr' : 'en', id),
        printings: { fr: has.has(`${id}|fr`) ? `fr:${id}` : null, en: has.has(`${id}|en`) ? `en:${id}` : null },
        finishes: finishesOf(r.finishes),
        owned: 0,
      }
    })
    const n = (s: string) => Number.parseInt(s.replace(/^\D+/, ''), 10)
    return out.sort((a, b) => (n(a.number) || Infinity) - (n(b.number) || Infinity) || a.number.localeCompare(b.number))
  }

  async function setHeader(code: string, lang: Lang) {
    const { rows } = await db().execute({
      sql: `SELECT name, released, (SELECT o.symbol FROM sets o WHERE o.code = s.code AND o.symbol IS NOT NULL LIMIT 1) AS symbol
              FROM sets s WHERE code = ? ORDER BY (lang = ?) DESC LIMIT 1`,
      args: [code, lang],
    })
    const r = rows[0]
    return r ? { code, name: String(r.name), icon: tcgImageUrl(game, r.symbol), releasedAt: r.released == null ? null : String(r.released), type: tcgSetType(code) } : null
  }

  /** Each set's most sought-after card (its highest price), in the site's language. */
  async function setArts(chunk: readonly string[], lang: Lang): Promise<Map<string, string>> {
    const { rows } = await db().execute({
      sql: `SELECT set_code, image FROM (
              SELECT c.set_code, c.image, ROW_NUMBER() OVER (PARTITION BY c.set_code
                       ORDER BY (c.lang = ?) DESC, COALESCE(c.price_eur, c.price_eur_foil, 0) DESC, CAST(c.number AS INTEGER)) AS rn
                FROM cards c WHERE c.image IS NOT NULL AND c.set_code IN (${marks(chunk.length)})
            ) WHERE rn = 1`,
      args: [lang, ...chunk] as InValue[],
    })
    return new Map(rows.map(r => [String(r.set_code), image(r.image)]))
  }

  /**
   * A printing id as Prism writes it ("fr:sv03.5-006") or bare ("sv03.5-006"),
   * else the set and number, else the name (either language), newest printing.
   */
  async function resolveImport(rows: readonly ImportRow[]) {
    const out = new Map<number, { id: string, warnings: ImportIssue[] }>()
    const langsOf = new Map<string, Set<string>>()
    const remember = (r: Row) => {
      const s = langsOf.get(String(r.id)) ?? new Set<string>()
      s.add(String(r.lang))
      langsOf.set(String(r.id), s)
    }
    const wanted = rows.map((r) => {
      const parsed = r.printingId ? parseOptcgPrintingId(r.printingId) : null
      // An id in the id column, or typed as the name ("4 sv03.5-006"), or a set and number.
      const ids = [parsed?.artId ?? r.printingId, r.name?.trim(), r.name?.trim().toLowerCase(), r.name?.trim().toUpperCase(), r.set && r.number ? `${r.set.toLowerCase()}-${r.number}` : null, r.set && r.number ? `${r.set.toUpperCase()}-${r.number}` : null]
      return { r, ids: ids.filter((x): x is string => !!x && /^[\w.\-]{1,40}$/.test(x)), id: null as string | null, lang: (parsed?.lang ?? r.lang ?? 'fr') as Lang }
    })
    const ids = [...new Set(wanted.flatMap(w => w.ids))]
    for (const r of await chunked(ids, async ch => (await db().execute({ sql: `SELECT id, lang FROM cards WHERE id IN (${marks(ch.length)})`, args: ch })).rows))
      remember(r)
    for (const w of wanted)
      w.id = w.ids.find(id => langsOf.has(id)) ?? null
    // By name: the newest printing of that name, either language.
    const names = [...new Set(wanted.filter(w => !w.id && w.r.name).map(w => fold(w.r.name!)))]
    const byName = new Map<string, string>()
    for (const r of await chunked(names, async ch => (await db().execute({
      sql: `SELECT c.id, c.lang, c.name_folded, c.card_key FROM cards c LEFT JOIN sets s ON s.code = c.set_code AND s.lang = c.lang
             WHERE c.name_folded IN (${marks(ch.length)}) OR c.card_key IN (${marks(ch.length)})
             ORDER BY s.released DESC`,
      args: [...ch, ...ch],
    })).rows)) {
      remember(r)
      for (const k of [String(r.name_folded), String(r.card_key)]) {
        if (!byName.has(k))
          byName.set(k, String(r.id))
      }
    }
    for (const w of wanted) {
      const warnings: ImportIssue[] = []
      let id = w.id
      if (!id && w.r.name) {
        id = byName.get(fold(w.r.name)) ?? null
        if (id && w.r.set)
          warnings.push('setNotFound')
      }
      if (!id)
        continue
      let lang = w.lang
      if (!langsOf.get(id)?.has(lang)) {
        lang = lang === 'fr' ? 'en' : 'fr'
        warnings.push('noLangPrinting')
      }
      out.set(w.r.line, { id: optcgPrintingId(lang, id), warnings })
    }
    return out
  }

  /** The cheapest printing of each card (by name), in that finish. */
  async function cheapest(printingIds: string[], finish: Finish) {
    const ids = printingIds.map(id => parseOptcgPrintingId(id)?.artId).filter((x): x is string => !!x)
    if (!ids.length)
      return new Map<string, number>()
    const col = finish === 'nonfoil' ? 'q.price_eur' : 'COALESCE(q.price_eur_foil, q.price_eur)'
    const { rows } = await db().execute({
      sql: `SELECT DISTINCT c.id, (SELECT MIN(${col}) FROM cards q WHERE q.card_key = c.card_key) AS price
              FROM cards c WHERE c.id IN (${marks(ids.length)})`,
      args: ids,
    })
    const byId = new Map(rows.filter(r => r.price != null).map(r => [String(r.id), Number(r.price)]))
    return new Map(printingIds.flatMap((p) => {
      const price = byId.get(parseOptcgPrintingId(p)?.artId ?? '')
      return price == null ? [] : [[p, price] as const]
    }))
  }

  return { cards, keys, sets, checklist, setHeader, setArts, resolveImport, ownLanguage: false, cheapest }
}
