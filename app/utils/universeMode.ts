import type { GameId } from '#shared/game'
import { GAMES } from '#shared/game'

/**
 * Some worlds have one side only: Yu-Gi-Oh's duel field and Riftbound's rift
 * are always at night (GameDef.forcedMode). While one is on screen, <html>
 * wears its mode's class, whatever the visitor chose; leaving it gives the
 * chosen mode back. Nuxt UI reads that class, so the tokens alone would not do.
 */
export function applyUniverseMode(universe: GameId | null | undefined, chosenDark: boolean): void {
  if (!import.meta.client)
    return
  const forced = universe ? GAMES[universe].forcedMode : undefined
  const dark = forced ? forced === 'dark' : chosenDark
  const el = document.documentElement
  el.classList.toggle('dark', dark)
  el.classList.toggle('light', !dark)
}

/** Whether a world sets its own mode (the mode switch then has nothing to do). */
export function forcedModeOf(universe: GameId | null | undefined): 'dark' | 'light' | null {
  return (universe && GAMES[universe].forcedMode) || null
}
