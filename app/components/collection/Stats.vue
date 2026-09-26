<script setup lang="ts">
import type { CollectionCopy } from '#shared/collection'
import type { GameId } from '#shared/game'
import type { OptcgColor } from '#shared/optcg/rules'
import { computed } from 'vue'
import { OPTCG_COLOR_HEX } from '~/utils/optcgColors'

// The collection's make-up, copies counted: by rarity (one bar in segments)
// and by colour (a pip and a count each).
const props = defineProps<{ game: GameId, copies: readonly CollectionCopy[] }>()
const { t, rarityLabel } = useLocale()

const MTG_RARITY = ['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus']
const RARITY_COLOR: Record<string, string> = { mythic: '#d9612b', rare: '#c9a13d', uncommon: '#8fa3b0', common: '#4b4b4b', special: '#8a4fc0', bonus: '#8a4fc0' }
const PALETTE = ['#c9312a', '#d9a91c', '#1d6f92', '#2f8a4f', '#7b3fa0', '#8a6f4a', '#2b2622', '#b0a8a0']
const MTG_COLOR: Record<string, string> = { W: '#efe3bf', U: '#1f6fb0', B: '#2b2622', R: '#d3202a', G: '#1f7a45', C: '#b0a8a0' }

const total = computed(() => props.copies.reduce((n, c) => n + c.quantity, 0))

const rarities = computed(() => {
  const m = new Map<string, number>()
  for (const c of props.copies) {
    const r = c.card?.rarity
    if (r)
      m.set(r, (m.get(r) ?? 0) + c.quantity)
  }
  const order = (r: string) => (props.game === 'mtg' ? MTG_RARITY.indexOf(r) : -1)
  return [...m.entries()]
    .sort((a, b) => (order(a[0]) - order(b[0])) || b[1] - a[1])
    .map(([r, n], i) => ({ id: r, label: rarityLabel(r), n, color: RARITY_COLOR[r] ?? PALETTE[i % PALETTE.length]! }))
})

const colors = computed(() => {
  const m = new Map<string, number>()
  for (const c of props.copies) {
    const cs = c.card?.colors ?? []
    for (const col of cs.length ? cs : (props.game === 'mtg' ? ['C'] : []))
      m.set(col, (m.get(col) ?? 0) + c.quantity)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({
    id,
    n,
    hex: props.game === 'mtg' ? MTG_COLOR[id] ?? '#999' : OPTCG_COLOR_HEX[id as OptcgColor] ?? '#999',
    label: props.game === 'mtg' ? t(`collection.color.${id}`) : t(`optcg.color.${id}`),
  }))
})
</script>

<template>
  <section v-if="total" class="stats">
    <p class="label">
      {{ t('collection.stats.rarity') }}
    </p>
    <div class="bar" role="img" :aria-label="rarities.map(r => `${r.label} ${r.n}`).join(', ')">
      <span v-for="r in rarities" :key="r.id" :style="{ flexGrow: r.n, background: r.color }" :title="`${r.label} · ${r.n}`" />
    </div>
    <ul class="legend">
      <li v-for="r in rarities" :key="r.id">
        <i :style="{ background: r.color }" />{{ r.label }} <b>{{ r.n }}</b>
      </li>
    </ul>
    <template v-if="colors.length">
      <p class="label">
        {{ t('collection.stats.colors') }}
      </p>
      <ul class="colors">
        <li v-for="c in colors" :key="c.id" :title="c.label">
          <i :style="{ background: c.hex }" /><b>{{ c.n }}</b>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.stats {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl);
  background: var(--color-surface-1);
}
.label {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.label:not(:first-child) {
  margin-top: 6px;
}
.bar {
  display: flex;
  gap: 2px;
  overflow: hidden;
  height: 8px;
  border-radius: 999px;
}
.bar span {
  min-width: 3px;
}
.legend,
.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: var(--color-text-mid);
}
.legend li,
.colors li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.legend b,
.colors b {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-text-high);
}
i {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
}
.colors i {
  width: 14px;
  height: 14px;
}
</style>
