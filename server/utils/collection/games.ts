/**
 * What the collection needs from each game, in one place: its cards by
 * printing, what set and card a printing is, its sets and checklists, its
 * sets' pictures, how a file's rows find their printings, the cheapest price
 * of a card. One adapter per game (a game in shared/game.ts without one fails
 * the tests); the collection's code asks the adapter, never "is it Magic".
 */
import type { ChecklistCard, CollectionCard, Finish, SetProgress } from '../../../shared/collection'
import type { ImportRow } from '../../../shared/collection-csv'
import type { GameId } from '../../../shared/game'
import type { ImportIssue } from './import'
import { mtgCollectionCards, optcgCollectionCards } from './cards'
import { mtgResolveImport, optcgResolveImport } from './import'
import { mtgChecklist, mtgKeys, mtgSetArts, mtgSetHeader, mtgSets, optcgChecklist, optcgKeys, optcgSetArts, optcgSetHeader, optcgSets } from './sets'
import { tcgCollection } from './tcg'
import { mtgCheapest } from './wishlist'

export type Lang = 'fr' | 'en'

export interface GameCollection {
  /** The cards of these printings (unknown ids left out). */
  cards: (printingIds: readonly string[]) => Promise<Map<string, CollectionCard>>
  /** Each printing's set and card key (what completion counts). */
  keys: (printingIds: readonly string[]) => Promise<Map<string, { set: string, key: string }>>
  /** The sets started (`owned`: set → card key → copies), or every set with `all`. */
  sets: (owned: Map<string, Map<string, number>>, all: boolean, lang: Lang) => Promise<SetProgress[]>
  /** A set's cards in order (owned left at 0). */
  checklist: (code: string, lang: Lang) => Promise<ChecklistCard[]>
  /** A set's name, symbol, date and type (progress filled by the caller). */
  setHeader: (code: string, lang: Lang) => Promise<Pick<SetProgress, 'code' | 'name' | 'icon' | 'releasedAt' | 'type'> | null>
  /** A picture per set (found ones only). */
  setArts: (codes: readonly string[], lang: Lang) => Promise<Map<string, string>>
  /** A file's rows matched to printings: line → printing and what was bent. */
  resolveImport: (rows: readonly ImportRow[]) => Promise<Map<number, { id: string, warnings: ImportIssue[] }>>
  /**
   * A copy's language is its own, apart from its printing's (Magic: a French
   * copy of a printing only listed in English). Otherwise the language is part
   * of the printing id (One Piece).
   */
  ownLanguage: boolean
  /** The cheapest price of each printing's card, over its printings (games with prices). */
  cheapest?: (printingIds: string[], finish: Finish) => Promise<Map<string, number>>
}

// Each entry calls its function when used: these modules import one another,
// so the functions are not all defined yet when this one loads.
const ADAPTERS: Record<GameId, GameCollection> = {
  mtg: {
    cards: ids => mtgCollectionCards(ids),
    keys: ids => mtgKeys(ids),
    sets: (owned, all) => mtgSets(owned, all),
    checklist: (code, lang) => mtgChecklist(code, lang),
    setHeader: code => mtgSetHeader(code),
    setArts: codes => mtgSetArts(codes),
    resolveImport: rows => mtgResolveImport(rows),
    ownLanguage: true,
    cheapest: (ids, finish) => mtgCheapest(ids, finish),
  },
  optcg: {
    cards: ids => optcgCollectionCards(ids),
    keys: ids => optcgKeys(ids),
    sets: (owned, all, lang) => optcgSets(owned, all, lang),
    checklist: (code, lang) => optcgChecklist(code, lang),
    setHeader: (code, lang) => optcgSetHeader(code, lang),
    setArts: (codes, lang) => optcgSetArts(codes, lang),
    resolveImport: rows => optcgResolveImport(rows),
    ownLanguage: false,
  },
  pokemon: tcgCollection('pokemon'),
  yugioh: tcgCollection('yugioh'),
}

/** A game's collection adapter. */
export function gameCollection(game: GameId): GameCollection {
  return ADAPTERS[game]
}

/** The games with an adapter (the registry test checks every game has one). */
export const COLLECTION_GAMES = Object.keys(ADAPTERS) as GameId[]
