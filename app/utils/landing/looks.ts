import type { GameId } from '#shared/game'

/**
 * Each world's look on the landing, from its cards: its colours, the face its
 * cards are set in (a free look-alike), whether its name is set in capitals.
 * The universes' own tokens live on their pages; these dress the landing's
 * doors to them (hero, gallery, showcase, finale).
 */
export interface WorldLook {
  bg: string
  ink: string
  muted: string
  accent: string
  onAccent: string
  face: string
  weight: number
  upper: boolean
}

export const WORLD_LOOK: Record<GameId, WorldLook> = {
  optcg: { bg: 'linear-gradient(160deg, #f4e4c3, #e6cf9f)', ink: '#231708', muted: '#5e472c', accent: '#c9312a', onAccent: '#fff8ec', face: '\'Anton\', Impact, sans-serif', weight: 400, upper: true },
  mtg: { bg: 'linear-gradient(160deg, #1d2530, #0f1318)', ink: '#eef0f1', muted: '#a9b3ba', accent: '#7aa0d4', onAccent: '#0f1318', face: '\'Philosopher\', Georgia, serif', weight: 700, upper: false },
  pokemon: { bg: 'linear-gradient(160deg, #fff7d6, #ffe07a)', ink: '#1b1d2a', muted: '#4a4d5e', accent: '#d6342e', onAccent: '#ffffff', face: '\'Cabin\', ui-sans-serif, sans-serif', weight: 700, upper: false },
  yugioh: { bg: 'radial-gradient(120% 80% at 50% 0%, #1b2f6b, #070b1a 70%)', ink: '#eef1fb', muted: '#aab3d4', accent: '#d4af37', onAccent: '#140f04', face: '\'Enriqueta\', Georgia, serif', weight: 700, upper: true },
  riftbound: { bg: 'radial-gradient(120% 80% at 50% 0%, #0a323c, #010a13 70%)', ink: '#f0e6d2', muted: '#a09b8c', accent: '#c8aa6e', onAccent: '#010a13', face: 'var(--rift-face)', weight: 700, upper: true },
}

/** A world's look as CSS custom properties, for a `:style` binding. */
export function lookVars(game: GameId): Record<string, string | number> {
  const l = WORLD_LOOK[game]
  return { '--bg': l.bg, '--ink': l.ink, '--muted': l.muted, '--accent': l.accent, '--on-accent': l.onAccent, '--face': l.face, '--weight': l.weight }
}
