import type { DeckEntry } from '#shared/decklist'
import type { GameCard } from '../../types/cards'

export interface ImageUris {
  small: string
  normal: string
  large: string
  png: string
}

export interface ScryfallCard {
  id: string
  oracle_id?: string
  name: string
  printed_name?: string
  lang: string
  set: string
  set_name: string
  collector_number: string
  rarity?: string
  artist?: string
  released_at?: string
  /** The local database keeps Commander's only. */
  legalities?: Record<string, string>
  scryfall_uri?: string
  type_line?: string
  printed_type_line?: string
  mana_cost?: string
  cmc?: number
  oracle_text?: string
  printed_text?: string
  colors?: string[]
  color_identity?: string[]
  keywords?: string[]
  prices?: {
    eur?: string | null
    eur_foil?: string | null
    usd?: string | null
  }
  image_uris?: {
    small: string
    normal: string
    large: string
    png: string
  }
  card_faces?: Array<{
    name: string
    printed_name?: string
    type_line?: string
    printed_type_line?: string
    mana_cost?: string
    oracle_text?: string
    printed_text?: string
    image_uris?: {
      small: string
      normal: string
      large: string
      png: string
    }
  }>
  layout: string
  // Scryfall image quality: 'missing' | 'placeholder' | 'lowres' | 'highres_scan'
  image_status?: string
  // Related cards this one produces/needs — used to auto-add the tokens a card
  // creates (component: 'token'); also covers meld pieces/results, unused here.
  all_parts?: Array<{ id: string, component: string, name: string, type_line?: string }>
}

export interface ResolvedCard {
  entry: DeckEntry
  // Game-neutral. Magic-only code narrows on `card.game === 'mtg'` to reach the
  // Scryfall payload in `card.raw`; everything else reads the shared fields.
  card: GameCard | null
  imageUrl: string | null
  backImageUrl: string | null
  lang: string
  // Best EUR price (FR printing first, else the default/EN printing — FR prints
  // are often priceless on Cardmarket, so we keep the default as a fallback).
  priceEur?: string | null
  error?: string
  /** The server could not be reached: worth asking again, unlike "not found". */
  transient?: boolean
}

export interface FetchProgress {
  loaded: number
  total: number
}
