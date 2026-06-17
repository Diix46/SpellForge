import type { ManaColor } from './useMtg'
import { computed } from 'vue'
import { useState } from '#app'
import { useManaIdentity } from './useManaIdentity'

/**
 * App-wide accent theme, driven by the active deck's commander color identity.
 * The deck page sets `colors`; the shell (AppBackground + accent vars) reads it,
 * so the *whole page* (aurora background included) takes on the deck's colours.
 * Reset to [] for neutral (dashboard).
 */
export function useAppTheme() {
  const { accentStyle, accentRgb } = useManaIdentity()
  // SSR-safe shared singleton.
  const colors = useState<ManaColor[]>('app-theme-colors', () => [])

  function setColors(next: ManaColor[]) {
    colors.value = next
  }
  function reset() {
    colors.value = []
  }

  // Inline style object for `:style` — sets --accent-rgb / --accent-rgb-2.
  const accentStyleVars = computed(() => accentStyle(colors.value))

  // RGB triplet strings for the background aurora (1 or 2 hues).
  const auroraRgb = computed<[string, string]>(() => {
    if (!colors.value.length)
      return [accentRgb('c'), accentRgb('c')]
    const first = accentRgb(colors.value[0]!)
    const last = accentRgb(colors.value[colors.value.length - 1]!)
    return [first, last]
  })

  const isThemed = computed(() => colors.value.length > 0)

  return { colors, setColors, reset, accentStyleVars, auroraRgb, isThemed }
}
