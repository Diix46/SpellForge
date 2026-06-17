<script setup lang="ts">
import { computed } from 'vue'

// One Magic mana/cost symbol, rendered as a circular pip. Accepts the inner
// token WITHOUT braces (e.g. "W", "2", "T", "W/U", "W/P", "C", "X").
const props = defineProps<{
  /** Symbol token without braces, e.g. 'W', '2', 'T', 'W/U', 'C'. */
  sym: string
  /** Pixel size of the pip. */
  size?: number
}>()

const COLOR_VAR: Record<string, string> = {
  w: 'var(--color-mana-w)',
  u: 'var(--color-mana-u)',
  b: 'var(--color-mana-b)',
  r: 'var(--color-mana-r)',
  g: 'var(--color-mana-g)',
  c: 'var(--color-ink-400)',
}

// Tap / untap render as a glyph rather than a letter.
const GLYPH: Record<string, string> = {
  t: '↻', // tap
  q: '↺', // untap
  e: '⚡', // energy
  s: '❄', // snow
}

const token = computed(() => props.sym.trim().toLowerCase())
const px = computed(() => props.size ?? 22)

// Hybrid (a/b) and phyrexian (x/p) symbols are "A/B" — split the pip in two.
const parts = computed(() => token.value.split('/'))
const isHybrid = computed(() => parts.value.length === 2)

function fill(part: string): string {
  return COLOR_VAR[part] ?? 'var(--color-ink-500)'
}

// A colour pip uses dark text; generic/number pips use a neutral grey fill.
const isColor = computed(() => token.value in COLOR_VAR && token.value !== 'c')
const isGeneric = computed(() => /^\d+$/.test(token.value) || token.value === 'x' || token.value === 'y' || token.value === 'z')

const background = computed(() => {
  if (isHybrid.value)
    return `linear-gradient(135deg, ${fill(parts.value[0]!)} 0 50%, ${fill(parts.value[1]!)} 50% 100%)`
  if (isColor.value)
    return COLOR_VAR[token.value]
  if (token.value === 'c')
    return COLOR_VAR.c
  // generic / numeric / unknown → neutral grey
  return 'var(--color-ink-300)'
})

const label = computed(() => {
  if (GLYPH[token.value])
    return GLYPH[token.value]
  if (isHybrid.value) {
    // phyrexian "W/P" → show the colour letter; hybrid "W/U" → show nothing (two-tone)
    if (parts.value[1] === 'p')
      return (parts.value[0] ?? '').toUpperCase()
    return ''
  }
  if (isGeneric.value)
    return token.value.toUpperCase()
  if (isColor.value || token.value === 'c')
    return '' // colour pips read by colour alone (keeps them clean)
  return token.value.toUpperCase()
})

// Dark glyph on light pips, light glyph on dark/generic pips.
const textColor = computed(() => {
  if (token.value === 'c' || isGeneric.value)
    return 'var(--color-bg-base)'
  if (GLYPH[token.value])
    return 'var(--color-text-high)'
  return 'var(--color-bg-base)'
})
</script>

<template>
  <span
    class="mana-pip inline-flex shrink-0 items-center justify-center rounded-full align-middle font-bold leading-none ring-1 ring-black/20"
    :style="{
      width: `${px}px`,
      height: `${px}px`,
      fontSize: `${Math.round(px * 0.55)}px`,
      background,
      color: textColor,
    }"
    :title="`{${sym}}`"
  >{{ label }}</span>
</template>
