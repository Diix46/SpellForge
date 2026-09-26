/**
 * A member's card collection: the copies they own, printing by printing.
 *
 * One stored copy line is a printing in one finish and one condition, with a
 * quantity. Magic printings are Scryfall ids (one id per language); a One
 * Piece art is the same in both languages, so its printing id carries the
 * copy's language: `fr:OP01-016` (see optcgPrintingId).
 *
 * Pure: shared by the app, the server and the tests.
 */
import type { GameId } from './game'

export const FINISHES = ['nonfoil', 'foil', 'etched'] as const
export type Finish = typeof FINISHES[number]

/** The grading scale collectors use, best first. */
export const CONDITIONS = ['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'] as const
export type Condition = typeof CONDITIONS[number]

export const MAX_COPIES = 9999

/** The card a copy is of, as the collection shows it. */
export interface CollectionCard {
  name: string
  /** Name in the copy's language when it differs (French printing). */
  printedName: string | null
  lang: 'en' | 'fr'
  set: string
  setName: string | null
  /** Set icon (Magic, an SVG from Scryfall). */
  setIcon: string | null
  number: string
  rarity: string | null
  releasedAt: string | null
  typeLine: string | null
  /** Colour identity letters (Magic) or One Piece colour names. */
  colors: string[]
  manaCost: string | null
  image: string
  thumb: string
  /** Cardmarket prices in euros, per finish; null when unknown (One Piece has none). */
  price: number | null
  priceFoil: number | null
  /** The finishes this printing exists in. */
  finishes: Finish[]
}

/** A stored copy line and its card. */
export interface CollectionCopy {
  id: string
  game: GameId
  printingId: string
  finish: Finish
  condition: Condition
  quantity: number
  purchasePrice: number | null
  location: string | null
  note: string | null
  createdAt: number
  updatedAt: number
  /** Null when the card database no longer knows the printing. */
  card: CollectionCard | null
}

export interface CollectionSummary {
  /** Copies, all lines' quantities added. */
  copies: number
  /** Distinct cards (by name), whatever the printing. */
  cards: number
  /** Distinct printings. */
  printings: number
  /** Current value in euros of the copies with a known price. */
  value: number
  /** What was paid, for the copies with a purchase price. */
  paid: number
  /** Copies without a known price. */
  unpriced: number
}

export const isFinish = (v: unknown): v is Finish => typeof v === 'string' && (FINISHES as readonly string[]).includes(v)
export const isCondition = (v: unknown): v is Condition => typeof v === 'string' && (CONDITIONS as readonly string[]).includes(v)

/** One Piece: the art and the copy's language in one printing id. */
export function optcgPrintingId(lang: 'en' | 'fr', artId: string): string {
  return `${lang}:${artId}`
}

export function parseOptcgPrintingId(id: string): { lang: 'en' | 'fr', artId: string } | null {
  const m = /^(en|fr):(\S+)$/.exec(id)
  return m ? { lang: m[1] as 'en' | 'fr', artId: m[2]! } : null
}

/** What one copy is worth today: the price of its own finish, else the nonfoil one. */
export function unitValue(card: CollectionCard | null, finish: Finish): number | null {
  if (!card)
    return null
  if (finish !== 'nonfoil')
    return card.priceFoil ?? card.price
  return card.price
}

export function summarize(copies: readonly CollectionCopy[]): CollectionSummary {
  let count = 0
  let value = 0
  let paid = 0
  let unpriced = 0
  const names = new Set<string>()
  const printings = new Set<string>()
  for (const c of copies) {
    count += c.quantity
    names.add((c.card?.name ?? c.printingId).toLowerCase())
    printings.add(c.printingId)
    const unit = unitValue(c.card, c.finish)
    if (unit == null)
      unpriced += c.quantity
    else
      value += unit * c.quantity
    if (c.purchasePrice != null)
      paid += c.purchasePrice * c.quantity
  }
  const round = (n: number) => Math.round(n * 100) / 100
  return { copies: count, cards: names.size, printings: printings.size, value: round(value), paid: round(paid), unpriced }
}

/** How far a collection goes into one set. */
export interface SetProgress {
  code: string
  name: string
  /** Magic: the set symbol (served by us). */
  icon: string | null
  releasedAt: string | null
  /** Magic: Scryfall's set type; One Piece: the kind (OP, EB, ST…). */
  type: string | null
  /** Cards in the set. */
  total: number
  /** Distinct cards of the set owned, any language, finish or condition. */
  owned: number
}

/** One card of a set's checklist. */
export interface ChecklistCard {
  /** What completion counts: Magic's collector number, One Piece's card number. */
  key: string
  number: string
  name: string
  printedName: string | null
  rarity: string | null
  thumb: string
  /** The printing to add when it is missing (the site's language when printed in it). */
  printingId: string
  /** Copies owned of it, every printing of the card in the set together. */
  owned: number
}

/** Owned and total cards over some sets, and the share done (0 to 1). */
export function completion(sets: readonly Pick<SetProgress, 'owned' | 'total'>[]): { owned: number, total: number, ratio: number } {
  let owned = 0
  let total = 0
  for (const s of sets) {
    owned += s.owned
    total += s.total
  }
  return { owned, total, ratio: total ? owned / total : 0 }
}

/** Families of sets, to narrow the list: the same words for both games. */
export const SET_KINDS = ['main', 'special', 'commander', 'starter', 'promo', 'other'] as const
export type SetKind = typeof SET_KINDS[number]

const MTG_KIND: Record<string, SetKind> = {
  expansion: 'main',
  core: 'main',
  masters: 'special',
  draft_innovation: 'special',
  eternal: 'special',
  masterpiece: 'special',
  arsenal: 'special',
  from_the_vault: 'special',
  spellbook: 'special',
  premium_deck: 'special',
  duel_deck: 'special',
  commander: 'commander',
  starter: 'starter',
  planechase: 'other',
  archenemy: 'other',
  promo: 'promo',
}
const OPTCG_KIND: Record<string, SetKind> = { OP: 'main', EB: 'special', PRB: 'special', ST: 'starter', P: 'promo' }

/** A set's family, from its type (Magic) or its code's kind (One Piece). */
export function setKind(game: 'mtg' | 'optcg', type: string | null): SetKind {
  return (type && (game === 'mtg' ? MTG_KIND : OPTCG_KIND)[type]) || 'other'
}

/**
 * What a deck and a collection match on: Magic's card name (its front face,
 * any case), One Piece's card number. Any printing, language or art counts.
 */
export function ownershipKey(game: 'mtg' | 'optcg', name: string): string {
  return game === 'mtg' ? (name.split(' // ')[0] ?? '').trim().toLowerCase() : name.trim().toUpperCase()
}

/** Copies a deck needs of a card, and how many of them the collection covers. */
export interface OwnedCount {
  need: number
  have: number
}

/**
 * A deck against a collection: per card, the copies needed and those owned
 * (never more than needed), and the totals.
 */
export function deckOwnership(needs: readonly { key: string, quantity: number }[], have: ReadonlyMap<string, number>) {
  const byKey = new Map<string, OwnedCount>()
  for (const n of needs) {
    const c = byKey.get(n.key) ?? { need: 0, have: 0 }
    c.need += n.quantity
    byKey.set(n.key, c)
  }
  let owned = 0
  let total = 0
  for (const [key, c] of byKey) {
    c.have = Math.min(c.need, have.get(key) ?? 0)
    owned += c.have
    total += c.need
  }
  return { byKey, owned, total }
}

/** A card on a member's wishlist, with what it costs now and what is owned of it. */
export interface WishItem {
  id: string
  game: 'mtg' | 'optcg'
  printingId: string
  /** Any printing of the card will do (its price: the cheapest one). */
  anyPrinting: boolean
  finish: Finish
  quantity: number
  targetPrice: number | null
  note: string | null
  createdAt: number
  card: CollectionCard | null
  /** Today's price for one copy (Magic), the cheapest printing when any will do. */
  price: number | null
  /** Copies of the card already in the collection, any printing. */
  owned: number
}

/** A wish whose price came down to its target. */
export function wishReached(w: Pick<WishItem, 'price' | 'targetPrice'>): boolean {
  return w.price != null && w.targetPrice != null && w.price <= w.targetPrice
}
