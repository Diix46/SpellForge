/**
 * What the collection's screens need from each game, on the browser's side:
 * how to find a card and its printings, how a copy's language travels, the
 * colours to count it by, how the 3D library is dressed. One entry per game
 * (`Record<GameId, …>`: a game added to shared/game.ts without its entry does
 * not compile). The components ask this, never "is it Magic".
 */
import type { Finish } from '#shared/collection'
import type { GameId } from '#shared/game'
import type { OptcgCard, OptcgPrint } from '#shared/optcg/types'
import type { TcgCard, TcgGameId } from '#shared/tcg/types'
import type { PrintChoice } from '~/composables/useCollection'
import type { PrintOption } from '~/composables/usePrintings'
import { optcgPrintingId, parseOptcgPrintingId } from '#shared/collection'
import { TCG_UI } from '~/utils/games/tcg'
import { OPTCG_COLOR_HEX } from '~/utils/optcgColors'

export type Lang = 'fr' | 'en'

export interface CardSuggestion { key: string, label: string, hint?: string, thumb?: string }

export interface CollectionClient {
  /** Cards to add, as typed (either language); `key` finds its printings. */
  suggest: (q: string, lang: Lang) => Promise<CardSuggestion[]>
  /** A card's printings to pick a copy from, keyed in the copy's language when it is part of the id. */
  prints: (key: string, copyLang: Lang, siteLang: Lang) => Promise<PrintChoice[]>
  /**
   * Where a copy's language lives: in the printing id (One Piece: the same art
   * in either language), or beside it (Magic: a printing per language, a copy
   * may still differ from it).
   */
  language: 'printing' | 'copy'
  /** A printing id in another language (language in the printing only). */
  relang: (printingId: string, lang: Lang) => string
  /** The language a printing id carries, if any. */
  langOf: (printingId: string) => Lang | null
  /** Completion counts a card within its set (Magic: set and number) or across sets (a card number). */
  cardPerSet: boolean
  /** Import dialog: the apps whose files it reads, and a sample list line. */
  importApps: readonly string[]
  sampleLine: string
  /** Precons come in families (Commander, Secret Lair…) to filter by. */
  preconKinds: boolean
  /** A set's picture is a whole card (framed high), not an art crop. */
  setPictureIsCard: boolean
  /** Rarities, strongest first (unknown ones after, most copies first). */
  rarityOrder: readonly string[]
  /** A card without colours counts as this one (Magic: colourless), if any. */
  colourless: string | null
  /** A colour's pip and its i18n key. */
  colour: (id: string) => { hex: string, label: string }
  /** How the 3D library is dressed (utils/bookshelf). */
  library: {
    /** The spines' title face, loaded before painting: CSS family, weight. */
    face: string
    weight: number
    /** Scanned maps in /textures/bookshelf: the bookcases, the walls. */
    wood: string
    wall: string
    /** The room: see utils/bookshelf/ambiance.ts. */
    room: 'arcanist' | 'cabin' | 'lab' | 'shrine' | 'hextech'
  }
}

const MTG_COLOR: Record<string, string> = { W: '#efe3bf', U: '#1f6fb0', B: '#2b2622', R: '#d3202a', G: '#1f7a45', C: '#b0a8a0' }

// The apps whose lists each generic-engine game's import reads.
const TCG_IMPORT_APPS: Record<TcgGameId, readonly string[]> = { pokemon: ['Prism', 'Pokémon TCG Live'], yugioh: ['Prism', 'YGOPRODeck'], riftbound: ['Prism', 'Piltover Archive'] }

export const COLLECTION_CLIENT: Record<GameId, CollectionClient> = {
  mtg: {
    async suggest(q, lang) {
      // English or French names; the card is then found by its English one.
      const { cards } = await $fetch<{ cards: { name: string, label: string, hint: string | null, thumb: string | null }[] }>('/api/collection/suggest', { query: { q, lang } })
      return cards.map(c => ({ key: c.name, label: c.label, hint: c.hint ?? undefined, thumb: c.thumb ?? undefined }))
    },
    async prints(key, _copyLang, siteLang) {
      const { prints } = await $fetch<{ prints: PrintOption[] }>('/api/cards/prints', { query: { name: key, lang: siteLang, all: '1' } })
      return prints.map(p => ({
        printingId: p.id,
        image: p.image,
        set: p.set,
        setName: p.setName,
        setIcon: p.setIcon ?? null,
        rarity: p.rarity ?? null,
        number: p.collectorNumber,
        lang: p.lang,
        price: p.priceEur,
        finishes: (p.finishes?.length ? p.finishes : ['nonfoil']) as Finish[],
        priceFoil: p.priceEurFoil ?? null,
      }))
    },
    language: 'copy',
    relang: id => id,
    langOf: () => null,
    cardPerSet: true,
    importApps: ['ManaBox', 'Moxfield', 'Cardmarket', 'Delver Lens', 'Prism'],
    sampleLine: '4 Sol Ring (CMM) 400',
    preconKinds: true,
    setPictureIsCard: false,
    rarityOrder: ['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus'],
    colourless: 'C',
    colour: id => ({ hex: MTG_COLOR[id] ?? '#999', label: `collection.color.${id}` }),
    library: { face: 'Philosopher, Georgia, serif', weight: 700, wood: 'wood_dark', wall: 'wood_dark', room: 'arcanist' },
  },
  optcg: {
    async suggest(q, lang) {
      const { cards } = await $fetch<{ cards: OptcgCard[] }>('/api/optcg/autocomplete', { query: { q, lang } })
      return cards.slice(0, 8).map(c => ({ key: c.number, label: c.name, hint: c.number, thumb: c.thumb }))
    },
    async prints(key, copyLang, siteLang) {
      const { prints } = await $fetch<{ prints: OptcgPrint[] }>('/api/optcg/prints', { query: { number: key, lang: siteLang } })
      return prints.map(p => ({
        printingId: optcgPrintingId(copyLang, p.id),
        image: p.thumb,
        set: p.set ?? key.split('-')[0] ?? '',
        setName: p.set ?? '',
        setIcon: null,
        rarity: p.rarity,
        number: p.id,
        lang: copyLang,
        price: null,
        finishes: ['nonfoil'] as Finish[],
        priceFoil: null,
      }))
    },
    language: 'printing',
    relang: (id, lang) => optcgPrintingId(lang, id.split(':')[1] ?? id),
    langOf: id => parseOptcgPrintingId(id)?.lang ?? null,
    cardPerSet: false,
    importApps: ['Prism'],
    sampleLine: '4x OP01-016',
    preconKinds: false,
    setPictureIsCard: true,
    rarityOrder: ['SEC', 'SP CARD', 'L', 'SR', 'R', 'UC', 'C', 'P'],
    colourless: null,
    colour: id => ({ hex: OPTCG_COLOR_HEX[id as keyof typeof OPTCG_COLOR_HEX] ?? '#999', label: `optcg.color.${id}` }),
    library: { face: 'Anton, Impact, sans-serif', weight: 400, wood: 'wood_planks', wall: 'planks_wall', room: 'cabin' },
  },
  pokemon: tcgClient('pokemon', { face: 'Cabin, \'Gill Sans\', sans-serif', weight: 700, wood: 'wood_planks', wall: 'planks_wall', room: 'lab' }),
  yugioh: tcgClient('yugioh', { face: '\'Enriqueta\', Georgia, serif', weight: 700, wood: 'wood_planks', wall: 'planks_wall', room: 'shrine' }),
  riftbound: tcgClient('riftbound', { face: 'Cinzel, Georgia, serif', weight: 700, wood: 'wood_dark', wall: 'wood_dark', room: 'hextech' }),
}

/** The finishes of a generic-engine printing, as the collection names them (server/utils/collection/tcg.ts). */
function tcgFinishes(card: TcgCard): Finish[] {
  const out: Finish[] = []
  if (card.finishes.includes('normal') || card.finishes.includes('firstEdition'))
    out.push('nonfoil')
  if (card.finishes.includes('holo'))
    out.push('foil')
  if (card.finishes.includes('reverse'))
    out.push('etched')
  return out.length ? out : ['nonfoil']
}

/** The generic engine's games: one client, read against the game's API and UI table (utils/games/tcg). */
function tcgClient(game: TcgGameId, library: CollectionClient['library']): CollectionClient {
  const ui = TCG_UI[game]
  return {
    async suggest(q, lang) {
      const { cards } = await $fetch<{ cards: TcgCard[] }>(`/api/tcg/${game}/autocomplete`, { query: { q, lang } })
      // Found again by its English name: what the collection matches on.
      return cards.slice(0, 8).map(c => ({ key: c.nameEn ?? c.name, label: c.name, hint: c.setName ?? c.set, thumb: c.thumb }))
    },
    async prints(key, copyLang, siteLang) {
      const { prints } = await $fetch<{ prints: TcgCard[] }>(`/api/tcg/${game}/prints`, { query: { name: key, lang: siteLang } })
      return prints.map(p => ({
        printingId: optcgPrintingId(copyLang, p.id),
        image: p.thumb,
        set: p.set,
        setName: p.setName ?? p.set,
        setIcon: null,
        rarity: p.rarity,
        number: p.number,
        lang: copyLang,
        // Prices travel as text here, as Scryfall writes them.
        price: p.price == null ? null : p.price.toFixed(2),
        finishes: tcgFinishes(p),
        priceFoil: p.priceFoil == null ? null : p.priceFoil.toFixed(2),
      }))
    },
    language: 'printing',
    relang: (id, lang) => optcgPrintingId(lang, id.split(':')[1] ?? id),
    langOf: id => parseOptcgPrintingId(id)?.lang ?? null,
    cardPerSet: true,
    importApps: TCG_IMPORT_APPS[game],
    sampleLine: ui.sampleLine,
    preconKinds: false,
    setPictureIsCard: true,
    rarityOrder: ui.rarityOrder,
    colourless: ui.colourless,
    colour: id => ({ hex: ui.typeColor[id] ?? '#999', label: `${game}.type.${id}` }),
    library,
  }
}

/** A game's collection screens' helper. */
export function collectionClient(game: GameId): CollectionClient {
  return COLLECTION_CLIENT[game]
}
