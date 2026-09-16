/**
 * The games Prism knows, and what each one allows.
 *
 * Pure: imported by the app (`#shared/game`), the server (relative path) and
 * the tests. Anything a page or a route decides per game reads it from here, so
 * adding a third game starts with one entry in each table below.
 */

export type GameId = 'mtg' | 'optcg'

export const GAME_IDS: readonly GameId[] = ['mtg', 'optcg']

export function parseGameId(value: unknown): GameId | null {
  return typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value) ? value as GameId : null
}

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
}

export const CAPABILITIES: Readonly<Record<GameId, Readonly<GameCapabilities>>> = {
  mtg: { proxyPdf: true, marketplace: true, coach: true, urlImport: true, suggestions: true, tokens: true },
  optcg: { proxyPdf: false, marketplace: false, coach: false, urlImport: false, suggestions: false, tokens: false },
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
export const UNIVERSE_SLUG: Readonly<Record<GameId, 'magic' | 'one-piece'>> = {
  mtg: 'magic',
  optcg: 'one-piece',
}

export function gameFromSlug(slug: unknown): GameId | null {
  const found = GAME_IDS.find(g => UNIVERSE_SLUG[g] === slug)
  return found ?? null
}

/** Where a deck lives. */
export function deckPath(deck: { id: string, game?: GameId | null }): string {
  return `/${UNIVERSE_SLUG[deck.game ?? 'mtg']}/deck/${encodeURIComponent(deck.id)}`
}

/** A shared deck's read-only page, in its universe. */
export function sharedPath(game: GameId | null | undefined, shareId: string): string {
  return `/${UNIVERSE_SLUG[game ?? 'mtg']}/shared/${encodeURIComponent(shareId)}`
}

/** A universe's home: its card library. */
export function libraryPath(game: GameId): string {
  return `/${UNIVERSE_SLUG[game]}`
}

/** A rule a deck breaks, as an i18n key the page translates. */
export interface ValidationIssue {
  level: 'error' | 'warning'
  key: string
  value?: string | number
}
