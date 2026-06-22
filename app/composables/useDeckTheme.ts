import type { MaybeRefOrGetter } from 'vue'
import type { ManaColor } from '~/composables/useMtg'
import { computed, toValue } from 'vue'
import { useManaIdentity } from '~/composables/useManaIdentity'

// Turn a deck's mana colours into the inline accent style that re-themes a
// scope (background aurora + accents). The `themeColors → accentStyle(...)`
// pair was duplicated verbatim across deck/[id].vue, shared/[shareId].vue and
// index.vue; this is the single source of truth. The COLOUR source differs per
// page (commander card vs decklist heuristic), so callers pass the resolved
// colours in and get back the normalised { themeColors, themeStyle }.

export function useDeckTheme(source: MaybeRefOrGetter<ManaColor[]>) {
  const { accentStyle } = useManaIdentity()
  const themeColors = computed<ManaColor[]>(() => toValue(source) ?? [])
  const themeStyle = computed(() => accentStyle(themeColors.value))
  return { themeColors, themeStyle }
}
