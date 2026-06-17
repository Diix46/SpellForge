// Lightweight WUBRG color-identity guess from a raw decklist, without needing
// Scryfall data. Uses basic land names + a small set of well-known mana dorks /
// signets that strongly imply a color. Good enough for a visual "fingerprint".

import type { ManaColor } from './useMtg'
import { canonicalColors, WUBRG } from './useMtg'

const LAND_HINTS: Record<ManaColor, RegExp> = {
  w: /\b(plains|plaine)\b/i,
  u: /\b(island|île|ile)\b/i,
  b: /\b(swamp|marais)\b/i,
  r: /\b(mountain|montagne)\b/i,
  g: /\b(forest|forêt|foret)\b/i,
}

// A few high-signal nonland cards per color (English + a couple FR) to catch
// decks that run few/no basics (dual-land / fetch heavy).
const CARD_HINTS: Record<ManaColor, RegExp> = {
  w: /\b(swords to plowshares|path to exile|smothering tithe|teferi's protection|plaine)\b/i,
  u: /\b(counterspell|contresort|rhystic study|cyclonic rift|brainstorm)\b/i,
  b: /\b(demonic tutor|dark ritual|toxic deluge|deadly rollick)\b/i,
  r: /\b(lightning bolt|foudre|chaos warp|blasphemous act)\b/i,
  g: /\b(cultivate|llanowar elves|birds of paradise|oiseaux de paradis|farseek)\b/i,
}

// RGB triplets mirroring the --accent-* vars in main.css.
const ACCENT_RGB: Record<ManaColor | 'c', string> = {
  w: '224, 200, 130',
  u: '79, 168, 232',
  b: '150, 130, 175',
  r: '232, 88, 68',
  g: '56, 184, 131',
  c: '168, 178, 196',
}

export function useManaIdentity() {
  function identity(raw: string): ManaColor[] {
    if (!raw)
      return []
    const found = WUBRG.filter(c => LAND_HINTS[c].test(raw) || CARD_HINTS[c].test(raw))
    return canonicalColors(found)
  }

  function colorVar(c: ManaColor): string {
    return `var(--color-mana-${c})`
  }

  // Full localized colour names (for tooltips / aria-labels on the WUBRG pips).
  const COLOR_NAMES: Record<'fr' | 'en', Record<ManaColor, string>> = {
    fr: { w: 'Blanc', u: 'Bleu', b: 'Noir', r: 'Rouge', g: 'Vert' },
    en: { w: 'White', u: 'Blue', b: 'Black', r: 'Red', g: 'Green' },
  }
  function colorName(c: ManaColor, isFr: boolean): string {
    return COLOR_NAMES[isFr ? 'fr' : 'en'][c]
  }

  // Short pip codes. FR initials (Blanc/Bleu both start with B → Bl/Bu to
  // disambiguate); EN keeps the universal single WUBRG letters.
  const COLOR_CODES: Record<'fr' | 'en', Record<ManaColor, string>> = {
    fr: { w: 'Bl', u: 'Bu', b: 'N', r: 'R', g: 'V' },
    en: { w: 'W', u: 'U', b: 'B', r: 'R', g: 'G' },
  }
  function colorCode(c: ManaColor, isFr: boolean): string {
    return COLOR_CODES[isFr ? 'fr' : 'en'][c]
  }

  /**
   * Build the inline style object that re-themes a scope based on a set of
   * mana colors. Mono → solid accent. Multi → gradient between first & last.
   * Empty/colorless → neutral platinum.
   */
  function accentStyle(colors: ManaColor[]): Record<string, string> {
    if (!colors.length) {
      return { '--accent-rgb': ACCENT_RGB.c, '--accent-rgb-2': ACCENT_RGB.c }
    }
    const firstColor = colors[0] ?? 'c'
    const lastColor = colors[colors.length - 1] ?? 'c'
    return { '--accent-rgb': ACCENT_RGB[firstColor], '--accent-rgb-2': ACCENT_RGB[lastColor] }
  }

  function accentRgb(c: ManaColor | 'c'): string {
    return ACCENT_RGB[c]
  }

  return { identity, colorVar, colorName, colorCode, accentStyle, accentRgb }
}
