/**
 * The games Prism knows: one entry per game in `GAMES`, and everything the app
 * decides per game reads it from there — its name and colours, its address,
 * what it allows. Adding a game starts here; a test fails until each part of
 * the app that needs one has its piece for it (cards, deck rules…).
 *
 * Pure: imported by the app (`#shared/game`), the server (relative path) and
 * the tests.
 */

export type GameId = 'mtg' | 'optcg' | 'pokemon' | 'yugioh' | 'riftbound'

export interface GameCapabilities {
  /** Printable proxies (PDF). Never for One Piece: Bandai's IP rules target exactly that. */
  proxyPdf: boolean
  /** Buying links (Cardmarket). */
  marketplace: boolean
  /** The AI coach, whose tools and prompts are Magic-only. */
  coach: boolean
  /** Deck import from an EDHREC or Archidekt URL. */
  urlImport: boolean
  /** "Often played with" suggestions (EDHREC). */
  suggestions: boolean
  /** Tokens added with the cards that create them. */
  tokens: boolean
  /** Card prices (EUR): a collection's value, its history, wishlist targets. */
  prices: boolean
  /** Printings in several finishes (foil, etched…) to tell apart. */
  finishes: boolean
  /** Set symbols (images) to show beside a printing. */
  setSymbols: boolean
}

export interface GameDef {
  id: GameId
  /** URL segment: /magic, /one-piece. */
  slug: string
  /** Its name, the same in every language. */
  label: string
  /** Its colour in lists, swatches and menus. */
  swatch: string
  /** Its icon in lists (Iconify name). */
  icon: string
  /** The browser's bar colour on its pages. */
  themeColor: { light: string, dark: string }
  /** Cards on a page are shown in this order in lists of games. */
  order: number
  /** How a card is named across printings: by name (Magic), by number (One Piece). */
  cardKey: 'name' | 'number'
  /** Collection export formats (shared/collection-csv.ts) other apps read. */
  exportFormats: readonly ('prism' | 'manabox' | 'moxfield' | 'text')[]
  /** Where its data and images come from (credited in the footer). */
  sources: readonly { label: string, url: string }[]
  capabilities: GameCapabilities
}

export const GAMES: Readonly<Record<GameId, Readonly<GameDef>>> = {
  optcg: {
    id: 'optcg',
    slug: 'one-piece',
    label: 'One Piece',
    swatch: '#c9312a',
    icon: 'i-lucide-anchor',
    themeColor: { light: '#efdfc0', dark: '#17120c' },
    order: 0,
    cardKey: 'number',
    exportFormats: ['prism', 'text'],
    sources: [{ label: 'Bandai', url: 'https://en.onepiece-cardgame.com' }],
    capabilities: { proxyPdf: false, marketplace: false, coach: false, urlImport: false, suggestions: false, tokens: false, prices: false, finishes: false, setSymbols: false },
  },
  pokemon: {
    id: 'pokemon',
    slug: 'pokemon',
    label: 'Pokémon',
    swatch: '#e3b22b',
    icon: 'i-lucide-zap',
    themeColor: { light: '#f4f1e6', dark: '#121829' },
    order: 2,
    cardKey: 'name',
    exportFormats: ['prism', 'text'],
    sources: [{ label: 'TCGdex', url: 'https://tcgdex.dev' }],
    capabilities: { proxyPdf: false, marketplace: false, coach: false, urlImport: false, suggestions: false, tokens: false, prices: true, finishes: true, setSymbols: true },
  },
  yugioh: {
    id: 'yugioh',
    slug: 'yu-gi-oh',
    label: 'Yu-Gi-Oh!',
    swatch: '#6b3fa0',
    icon: 'i-lucide-pyramid',
    themeColor: { light: '#efe6d2', dark: '#120f1c' },
    order: 3,
    cardKey: 'name',
    exportFormats: ['prism', 'text'],
    sources: [{ label: 'YGOPRODeck', url: 'https://ygoprodeck.com' }],
    capabilities: { proxyPdf: false, marketplace: false, coach: false, urlImport: false, suggestions: false, tokens: false, prices: true, finishes: false, setSymbols: false },
  },
  riftbound: {
    id: 'riftbound',
    slug: 'riftbound',
    label: 'Riftbound',
    swatch: '#1f8a9a',
    icon: 'i-lucide-hexagon',
    themeColor: { light: '#e9eef0', dark: '#0b1519' },
    order: 4,
    cardKey: 'name',
    exportFormats: ['prism', 'text'],
    sources: [{ label: 'Riftcodex', url: 'https://riftcodex.com' }, { label: 'Cardmarket', url: 'https://www.cardmarket.com' }],
    capabilities: { proxyPdf: false, marketplace: false, coach: false, urlImport: false, suggestions: false, tokens: false, prices: true, finishes: true, setSymbols: false },
  },
  mtg: {
    id: 'mtg',
    slug: 'magic',
    label: 'Magic',
    swatch: '#2d4f7c',
    icon: 'i-lucide-book-open',
    themeColor: { light: '#f7f7f5', dark: '#0f1113' },
    order: 1,
    cardKey: 'name',
    exportFormats: ['prism', 'manabox', 'moxfield', 'text'],
    sources: [{ label: 'Scryfall', url: 'https://scryfall.com' }, { label: 'EDHREC', url: 'https://edhrec.com' }],
    capabilities: { proxyPdf: true, marketplace: true, coach: true, urlImport: true, suggestions: true, tokens: true, prices: true, finishes: true, setSymbols: true },
  },
}

/** Every game, in display order. */
export const GAME_IDS: readonly GameId[] = (Object.keys(GAMES) as GameId[]).sort((a, b) => GAMES[a].order - GAMES[b].order)

/** Every game's definition, in display order. */
export const GAME_LIST: readonly Readonly<GameDef>[] = GAME_IDS.map(id => GAMES[id])

/** The game a deck or a record without one belongs to (they predate other games). */
export const DEFAULT_GAME: GameId = 'mtg'

export function parseGameId(value: unknown): GameId | null {
  return typeof value === 'string' && value in GAMES ? value as GameId : null
}

export const CAPABILITIES: Readonly<Record<GameId, Readonly<GameCapabilities>>> = Object.fromEntries(
  GAME_IDS.map(id => [id, GAMES[id].capabilities]),
) as Record<GameId, GameCapabilities>

/** What a game allows. */
export function can(game: GameId | null | undefined, capability: keyof GameCapabilities): boolean {
  return !!game && GAMES[game].capabilities[capability]
}

/**
 * Proxies are printed only for games that allow it. The One Piece pages never
 * load the PDF code; this stops a One Piece card that reaches it anyway.
 */
export function assertProxyPrintable(games: Iterable<GameId | null | undefined>): void {
  for (const game of games) {
    if (game && !CAPABILITIES[game].proxyPdf)
      throw new Error(`Proxy printing is not available for ${game}`)
  }
}

/** URL segment of each universe. */
export const UNIVERSE_SLUG: Readonly<Record<GameId, string>> = Object.fromEntries(
  GAME_IDS.map(id => [id, GAMES[id].slug]),
) as Record<GameId, string>

export function gameFromSlug(slug: unknown): GameId | null {
  const found = GAME_IDS.find(g => UNIVERSE_SLUG[g] === slug)
  return found ?? null
}

/** Where a deck lives. */
export function deckPath(deck: { id: string, game?: GameId | null }): string {
  return `/${UNIVERSE_SLUG[deck.game ?? DEFAULT_GAME]}/deck/${encodeURIComponent(deck.id)}`
}

/** A shared deck's read-only page, in its universe. */
export function sharedPath(game: GameId | null | undefined, shareId: string): string {
  return `/${UNIVERSE_SLUG[game ?? DEFAULT_GAME]}/shared/${encodeURIComponent(shareId)}`
}

/**
 * A card's own page. A game that names cards by number goes by number (names
 * repeat); one that names them by name goes by name, a double-faced card by
 * its front face, so the address never holds a slash.
 */
export function cardPath(game: GameId, key: string): string {
  const id = GAMES[game].cardKey === 'name' ? key.split(' // ')[0]! : key
  return `/${UNIVERSE_SLUG[game]}/card/${encodeURIComponent(id)}`
}

/** A universe's home: its card library. */
export function libraryPath(game: GameId): string {
  return `/${UNIVERSE_SLUG[game]}`
}

/** A game's collection, or one of its pages ('/sets/blb'). */
export function collectionPath(game: GameId, sub = ''): string {
  return `/${UNIVERSE_SLUG[game]}/collection${sub}`
}

/** A rule a deck breaks, as an i18n key the page translates. */
export interface ValidationIssue {
  level: 'error' | 'warning'
  key: string
  value?: string | number
}
