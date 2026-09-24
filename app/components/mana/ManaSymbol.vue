<script setup lang="ts">
import { computed } from 'vue'
import { MANA_GLYPH } from '#shared/mtg/mana-glyphs'

// One Magic mana/cost symbol, as printed on the cards: the Mana font's glyph
// (sun, drop, skull, flame, tree, tap arrow…) in black on the symbol's pip.
// Accepts the inner token WITHOUT braces (e.g. "W", "2", "T", "W/U", "W/P").
const props = defineProps<{
  /** Symbol token without braces, e.g. 'W', '2', 'T', 'W/U', 'C'. */
  sym: string
  /** Pixel size of the pip. */
  size?: number
}>()

// The pips' colours as printed (the recomposed cards use the same).
const PIP: Record<string, string> = {
  w: '#f8f6d8',
  u: '#c1d7e9',
  b: '#bab1ab',
  r: '#e49977',
  g: '#a3c095',
}
const GENERIC = '#cac5c0'

const token = computed(() => props.sym.trim().toLowerCase())
const px = computed(() => props.size ?? 22)
const parts = computed(() => token.value.split('/'))
// "W/U" hybrid, split along the diagonal; "W/P" phyrexian, one colour.
const hybrid = computed(() => parts.value.length === 2 && parts.value[1] !== 'p')
const phyrexian = computed(() => parts.value.length === 2 && parts.value[1] === 'p')

function glyphOf(t: string): string | null {
  if (t === 't')
    return MANA_GLYPH.tap ?? null
  if (t === 'q')
    return MANA_GLYPH.untap ?? null
  if (t === 'e')
    return MANA_GLYPH.energy ?? null
  return MANA_GLYPH[t] ?? null
}

const background = computed(() => {
  if (hybrid.value)
    return `linear-gradient(135deg, ${PIP[parts.value[0]!] ?? GENERIC} 0 50%, ${PIP[parts.value[1]!] ?? GENERIC} 50% 100%)`
  if (phyrexian.value)
    return PIP[parts.value[0]!] ?? GENERIC
  // Energy prints bare, without a pip.
  if (token.value === 'e')
    return 'transparent'
  return PIP[token.value] ?? GENERIC
})

// What sits on the pip: a glyph, a figure, or two small halves for a hybrid.
const content = computed<{ kind: 'glyph' | 'text', value: string }[]>(() => {
  if (hybrid.value)
    return parts.value.map(p => (glyphOf(p) ? { kind: 'glyph' as const, value: glyphOf(p)! } : { kind: 'text' as const, value: p.toUpperCase() }))
  if (phyrexian.value)
    return [{ kind: 'glyph', value: MANA_GLYPH.p ?? 'P' }]
  const g = glyphOf(token.value)
  return [g ? { kind: 'glyph', value: g } : { kind: 'text', value: token.value.toUpperCase() }]
})
</script>

<template>
  <span
    class="mana-pip relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full align-middle leading-none text-[#111]"
    :class="token === 'e' ? '' : 'shadow-[0_1px_0_rgba(0,0,0,0.55)]'"
    :style="{ width: `${px}px`, height: `${px}px`, background }"
    :title="`{${sym}}`"
    role="img"
    :aria-label="`{${sym}}`"
  >
    <template v-if="hybrid">
      <span
        v-for="(c, i) in content"
        :key="i"
        class="absolute"
        :class="[c.kind === 'glyph' ? 'mana-glyph' : 'mana-figure', i === 0 ? 'left-[14%] top-[10%]' : 'bottom-[10%] right-[14%]']"
        :style="{ fontSize: `${Math.round(px * 0.42)}px` }"
      >{{ c.value }}</span>
    </template>
    <span
      v-else
      :class="content[0]!.kind === 'glyph' ? 'mana-glyph' : 'mana-figure'"
      :style="{ fontSize: `${Math.round(px * (content[0]!.kind === 'glyph' ? 0.72 : 0.78))}px` }"
    >{{ content[0]!.value }}</span>
  </span>
</template>

<style scoped>
.mana-glyph {
  font-family: 'Mana', sans-serif;
  line-height: 1;
}
/* Generic costs print as a heavy serif figure. */
.mana-figure {
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 700;
  line-height: 1;
  transform: translateY(0.04em);
}
</style>
