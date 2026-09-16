/**
 * Resolve deck entries to displayable cards — server-side, in one pass.
 *
 * This replaces a client-side cascade that ran for every card of a deck:
 * `/cards/collection` (which ignores language and hands back the default
 * printing), then an exact localised lookup, a by-name French search, and a
 * high-resolution upgrade — up to five network calls per card. Here a whole deck
 * resolves in a handful of indexed queries, because the hard part (which
 * printing to show in which language) was settled at ingest in `best_printings`.
 */
import type { Client } from '@libsql/client'
import { toScryfallShape } from './mtg-shape'
import { fold } from './text'

type Row = Record<string, unknown>

export interface ResolveEntry {
  name: string
  set?: string | null
  collectorNumber?: string | null
}

export interface ResolvedRow {
  card: Row | null
  lang: string
  error?: string
}

// Same columns as the search, plus `is_real_image`, which pinned resolution
// needs to decide whether a localised printing is actually usable.
const PRINT_COLS = `
  p.id AS printing_id, p.lang, p.set_code, p.set_name, p.collector_number,
  p.released_at, p.rarity, p.promo, p.image_status, p.img_version, p.artist,
  p.printed_name, p.printed_type_line, p.printed_text, p.price_eur, p.is_real_image`

function list(n: number): string {
  return Array.from({ length: n }).fill('?').join(',')
}

/**
 * Pinned entries carry an exact printing chosen by the user. Honour it: take
 * its localised version when that has a real image, otherwise the same printing
 * in English. Never another art.
 *
 * DELIBERATE FIX: the client cascade used to "upgrade" a pinned English
 * printing to a different high-resolution one when the pinned scan was low-res,
 * silently replacing the art the user picked — contrary to the documented rule
 * that a pinned printing is never substituted.
 */
async function resolvePinned(db: Client, entries: ResolveEntry[], lang: string, found: Map<number, Row>): Promise<void> {
  const pinned = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.set && e.collectorNumber)
  if (!pinned.length)
    return

  const { rows } = await db.execute({
    sql: `SELECT o.*, ${PRINT_COLS}
            FROM printings p
            JOIN oracle_cards o ON o.oracle_id = p.oracle_id
           WHERE (p.set_code, p.collector_number) IN (VALUES ${pinned.map(() => '(?, ?)').join(',')})
             AND p.lang IN (?, 'en')`,
    args: [...pinned.flatMap(({ e }) => [e.set!.toLowerCase(), e.collectorNumber!]), lang],
  })

  for (const { e, i } of pinned) {
    const same = rows.filter(r => r.set_code === e.set!.toLowerCase() && r.collector_number === e.collectorNumber)
    const localised = same.find(r => r.lang === lang && r.is_real_image)
    const pick = localised ?? same.find(r => r.lang === 'en') ?? same[0]
    if (pick)
      found.set(i, pick)
    // No match at all (a printing we did not ingest): fall through to by-name.
  }
}

async function resolveByName(db: Client, entries: ResolveEntry[], lang: string, found: Map<number, Row>): Promise<void> {
  const pending = entries.map((e, i) => ({ e, i })).filter(({ i }) => !found.has(i))
  if (!pending.length)
    return

  const keys = [...new Set(pending.map(({ e }) => fold(e.name)))]
  const { rows: oracles } = await db.execute({
    sql: `SELECT oracle_id, name_folded, name_front, is_extra, edhrec_sort
            FROM oracle_cards
           WHERE name_folded IN (${list(keys.length)}) OR name_front IN (${list(keys.length)})`,
    args: [...keys, ...keys],
  })

  // Several cards can answer to one name ("A // B" front faces, art series
  // reprints). An exact full-name match wins, then real cards over extras, then
  // the most played — the same preference the client's findMatch expressed.
  const oracleFor = new Map<string, string>()
  for (const key of keys) {
    const best = oracles
      .filter(o => o.name_folded === key || o.name_front === key)
      .sort((a, b) =>
        Number(b.name_folded === key) - Number(a.name_folded === key)
        || Number(a.is_extra) - Number(b.is_extra)
        || Number(a.edhrec_sort) - Number(b.edhrec_sort))[0]
    if (best)
      oracleFor.set(key, String(best.oracle_id))
  }

  const ids = [...new Set(oracleFor.values())]
  if (!ids.length)
    return

  const { rows } = await db.execute({
    sql: `SELECT o.*, ${PRINT_COLS}
            FROM best_printings b
            JOIN printings p ON p.id = b.printing_id
            JOIN oracle_cards o ON o.oracle_id = b.oracle_id
           WHERE b.lang = ? AND b.oracle_id IN (${list(ids.length)})`,
    args: [lang, ...ids],
  })
  const printingFor = new Map(rows.map(r => [String(r.oracle_id), r]))

  // best_printings only holds printings with a real image. A card whose every
  // printing is a placeholder would otherwise come back "not found", where the
  // old client returned it with its placeholder art. Keep that behaviour.
  const missing = ids.filter(id => !printingFor.has(id))
  if (missing.length) {
    const { rows: fallback } = await db.execute({
      sql: `SELECT o.*, ${PRINT_COLS}
              FROM printings p
              JOIN oracle_cards o ON o.oracle_id = p.oracle_id
             WHERE p.oracle_id IN (${list(missing.length)}) AND p.lang IN (?, 'en')
             ORDER BY (p.lang = ?) DESC, p.released_at DESC`,
      args: [...missing, lang, lang],
    })
    for (const r of fallback) {
      if (!printingFor.has(String(r.oracle_id)))
        printingFor.set(String(r.oracle_id), r)
    }
  }

  for (const { e, i } of pending) {
    const oracleId = oracleFor.get(fold(e.name))
    const row = oracleId ? printingFor.get(oracleId) : undefined
    if (row)
      found.set(i, row)
  }
}

/**
 * Resolve every entry, preserving input order. Unmatched entries come back with
 * `card: null` and the same error message the client used to produce.
 */
export async function resolveEntries(db: Client, entries: ResolveEntry[], lang: string): Promise<ResolvedRow[]> {
  const found = new Map<number, Row>()
  await resolvePinned(db, entries, lang, found)
  await resolveByName(db, entries, lang, found)

  const indices = [...found.keys()]
  const shaped = await toScryfallShape(db, indices.map(i => found.get(i)!))
  const cardAt = new Map(indices.map((i, k) => [i, shaped[k]!]))

  return entries.map((entry, i) => {
    const card = cardAt.get(i) ?? null
    return card
      ? { card, lang: String(found.get(i)!.lang) }
      : { card: null, lang, error: `Carte introuvable: ${entry.name}` }
  })
}

/**
 * Drop-in local replacement for `resolveScryfallByName`: same contract, a Map
 * of lowercased name → Scryfall-shaped card, so its callers change one line.
 *
 * Keyed by BOTH the name as written and the canonical name. The Scryfall
 * version keyed only by the canonical name it returned, while callers looked
 * up by the name the model wrote — so "Delver of Secrets" resolved to
 * "Delver of Secrets // Insectile Aberration" and was then reported missing,
 * silently rejecting a real card.
 */
export async function resolveCardsByName<T = Row>(db: Client, names: string[]): Promise<Map<string, T>> {
  const unique = [...new Set(names.map(n => n.trim()).filter(Boolean))]
  const byName = new Map<string, T>()
  if (!unique.length)
    return byName
  // Language is irrelevant to identity and legality checks; English carries
  // the canonical data.
  const rows = await resolveEntries(db, unique.map(name => ({ name })), 'en')
  rows.forEach((r, i) => {
    if (!r.card)
      return
    const card = r.card as T
    byName.set(unique[i]!.toLowerCase(), card)
    byName.set(String(r.card.name).toLowerCase(), card)
  })
  return byName
}
