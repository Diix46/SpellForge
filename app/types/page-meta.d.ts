import type { GameId } from '#shared/game'

declare module '#app' {
  interface PageMeta {
    /**
     * The game universe a page belongs to. It re-themes the whole document
     * (tokens, fonts, background, cursor); pages outside any universe leave it
     * unset and keep the neutral look.
     */
    universe?: GameId
  }
}

export {}
