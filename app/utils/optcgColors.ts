import type { OptcgColor } from '#shared/optcg/rules'

/** One Piece colours as painted on the cards, for pips and bars. */
export const OPTCG_COLOR_HEX: Readonly<Record<OptcgColor, string>> = {
  Red: '#c9312a',
  Green: '#2f8a4f',
  Blue: '#1d6f92',
  Purple: '#7b3fa0',
  Black: '#2b2622',
  Yellow: '#d9a91c',
}

/** A CSS background for a card's colours: flat, or split for multicolour. */
export function optcgColorFill(colors: readonly OptcgColor[]): string {
  const hex = colors.map(c => OPTCG_COLOR_HEX[c])
  if (!hex.length)
    return '#8a6f4a'
  if (hex.length === 1)
    return hex[0]!
  const step = 100 / hex.length
  return `linear-gradient(135deg, ${hex.map((h, i) => `${h} ${i * step}% ${(i + 1) * step}%`).join(', ')})`
}

function rgbTriplet(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

/** Accent variables for a scope themed by a One Piece Leader's colours. */
export function optcgAccentStyle(colors: readonly OptcgColor[]): Record<string, string> {
  if (!colors.length)
    return {}
  const first = OPTCG_COLOR_HEX[colors[0]!]
  const last = OPTCG_COLOR_HEX[colors[colors.length - 1]!]
  return { '--accent-rgb': rgbTriplet(first), '--accent-rgb-2': rgbTriplet(last) }
}
