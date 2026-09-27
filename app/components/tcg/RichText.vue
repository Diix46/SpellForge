<script setup lang="ts">
import type { TcgGameId } from '#shared/tcg/types'
import { computed } from 'vue'
import { TCG_UI, tcgLabel } from '~/utils/games/tcg'
import { richText, riftSymbol } from '~/utils/tcg/richText'

// A card's rules text as it reads on the card: Riftbound's symbols as its
// pips (energy costs, runes, might, exhaust) and its bracketed keywords as
// tags, the rest as words.
const props = defineProps<{ game: TcgGameId, text: string }>()
const { t } = useLocale()

const RUNES = ['fury', 'calm', 'mind', 'body', 'chaos', 'order']
const RAINBOW = `conic-gradient(${RUNES.map(r => TCG_UI.riftbound.typeColor[r[0]!.toUpperCase() + r.slice(1)] ?? '#999').join(', ')}, ${TCG_UI.riftbound.typeColor.Fury ?? '#d8403a'})`

const segments = computed(() => richText(props.text, { keywords: props.game === 'riftbound' }).map((s) => {
  if (s.kind !== 'symbol')
    return s
  const sym = riftSymbol(s.id)
  if (sym.kind === 'rune' && sym.rune !== 'rainbow') {
    const type = sym.rune[0]!.toUpperCase() + sym.rune.slice(1)
    return { kind: 'rune' as const, type, label: t('riftbound.sym.rune').replace('{rune}', tcgLabel(t, 'riftbound', 'type', type)) }
  }
  if (sym.kind === 'rune')
    return { kind: 'rainbow' as const, label: t('riftbound.sym.anyRune') }
  if (sym.kind === 'energy')
    return { kind: 'energy' as const, n: sym.n, label: t('riftbound.sym.energy').replace('{n}', String(sym.n)) }
  if (sym.kind === 'might')
    return { kind: 'icon' as const, icon: 'i-lucide-sword', label: t('riftbound.sym.might') }
  if (sym.kind === 'exhaust')
    return { kind: 'icon' as const, icon: 'i-lucide-rotate-cw', label: t('riftbound.sym.exhaust') }
  return { kind: 'text' as const, value: `:${s.id}:` }
}))
</script>

<template>
  <span class="rich">
    <template v-for="(s, i) in segments" :key="i">
      <template v-if="s.kind === 'text'">{{ s.value }}</template>
      <span v-else-if="s.kind === 'keyword'" class="kw">{{ s.value }}</span>
      <TcgTypeIcon v-else-if="s.kind === 'rune'" class="sym" :game="game" :type="s.type" :size="17" />
      <span v-else-if="s.kind === 'rainbow'" class="sym rainbow" :style="{ background: RAINBOW }" role="img" :title="s.label" :aria-label="s.label" />
      <span v-else-if="s.kind === 'energy'" class="sym energy" role="img" :title="s.label" :aria-label="s.label">{{ s.n }}</span>
      <span v-else-if="s.kind === 'icon'" class="sym glyph" role="img" :title="s.label" :aria-label="s.label"><UIcon :name="s.icon" /></span>
    </template>
  </span>
</template>

<style scoped>
.sym {
  display: inline-grid;
  place-items: center;
  width: 17px;
  height: 17px;
  margin: 0 1px;
  vertical-align: -3px;
  border-radius: 50%;
}
.energy {
  background: var(--color-text-high);
  color: var(--color-bg-base);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1;
}
.rainbow {
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
}
.glyph {
  width: auto;
  height: auto;
  color: var(--color-text-high);
  font-size: 15px;
}
.kw {
  display: inline-block;
  padding: 0 6px;
  border-radius: 4px;
  background: color-mix(in srgb, rgb(var(--accent-rgb)) 22%, transparent);
  color: var(--color-text-high);
  font-size: 0.86em;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
</style>
