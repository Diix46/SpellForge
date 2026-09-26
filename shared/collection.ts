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
