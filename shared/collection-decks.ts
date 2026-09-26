/**
 * Whole decks into a collection: a preconstructed deck as it came in the box,
 * or one of the member's decks, turned into the rows an import reads
 * (shared/collection-csv.ts) — so they get the same preview, and the same undo.
 */
import type { ImportRow } from './collection-csv'
import type { GameId } from './game'
import { ownershipKey } from './collection'
import { parseMtgDecklist } from './mtg/decklist'
import { parseOptcgDecklist } from './optcg/decklist'

/** Families of preconstructed decks, to narrow the list. */
export const PRECON_KINDS = ['commander', 'secretlair', 'jumpstart', 'other'] as const
export type PreconKind = typeof PRECON_KINDS[number]

export function preconKind(type: string): PreconKind {
  if (type === 'Commander Deck' || type === 'Brawl Deck')
    return 'commander'
  if (type === 'Secret Lair Drop')
    return 'secretlair'
  if (type === 'Jumpstart')
    return 'jumpstart'
  return 'other'
}

export interface PreconSummary {
  file: string
  code: string
  name: string
  type: string
  released: string | null
  cards: number
  commander: string | null
  /** The commander's name in the site's language (MTGJSON names decks in English only). */
  commanderLocal: string | null
  setName: string | null
  thumb: string | null
}

export interface PreconCard {
  section: 'commander' | 'mainBoard' | 'sideBoard'
  count: number
  name: string
  set: string
  number: string
  scryfallId: string | null
  foil: boolean
}

function row(line: number, fields: Partial<ImportRow> & Pick<ImportRow, 'quantity'>): ImportRow {
  return {
    line,
    name: null,
    set: null,
    setName: null,
    number: null,
    printingId: null,
    lang: null,
    otherLang: null,
    finish: 'nonfoil',
    condition: 'NM',
    purchasePrice: null,
    location: null,
    note: null,
    ...fields,
  }
}

/**
 * A precon's cards, each in its exact printing and foiling. In English the
 * Scryfall id is the printing; in French the same set and number, in French
 * when it was printed so (the import says when it was not).
 */
export function preconImportRows(cards: readonly PreconCard[], lang: 'fr' | 'en', location: string | null = null): ImportRow[] {
  return cards.map((c, i) => row(i + 1, {
    name: c.name,
    set: c.set,
    number: c.number,
    printingId: lang === 'en' ? c.scryfallId : null,
    lang,
    finish: c.foil ? 'foil' : 'nonfoil',
    quantity: c.count,
    location,
  }))
}

/**
 * One of the member's decks. With `owned` (copies held of each card, by
 * ownershipKey), only what the collection lacks: a deck built in Prism was
 * often built from the collection itself, and adding it whole would count
 * those cards twice. Magic keeps a pinned printing; One Piece a pinned art.
 */
export function deckImportRows(game: GameId, raw: string, lang: 'fr' | 'en', opts: { owned?: ReadonlyMap<string, number>, location?: string | null } = {}): ImportRow[] {
  const parsed = game === 'mtg' ? parseMtgDecklist(raw) : parseOptcgDecklist(raw)
  const left = opts.owned ? new Map(opts.owned) : null
  const out: ImportRow[] = []
  for (const e of [...parsed.mainboard, ...parsed.sideboard]) {
    let quantity = e.quantity
    if (left) {
      const key = ownershipKey(game, e.name)
      const have = left.get(key) ?? 0
      const used = Math.min(have, quantity)
      left.set(key, have - used)
      quantity -= used
    }
    if (quantity <= 0)
      continue
    out.push(game === 'mtg'
      ? row(out.length + 1, { name: e.name, set: e.set?.toLowerCase() ?? null, number: e.collectorNumber ?? null, lang: e.lang ?? lang, quantity, location: opts.location ?? null })
      : row(out.length + 1, { name: e.name, printingId: e.art ? `${lang}:${e.art}` : null, lang, quantity, location: opts.location ?? null }))
  }
  return out
}
