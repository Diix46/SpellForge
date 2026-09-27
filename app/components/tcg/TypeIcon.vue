<script setup lang="ts">
import type { TcgGameId } from '#shared/tcg/types'
import { computed } from 'vue'
import { TCG_UI, tcgLabel } from '~/utils/games/tcg'

// A type as a round pip: Pokémon's energy, its symbol on its colour.
const props = withDefaults(defineProps<{ game: TcgGameId, type: string, size?: number }>(), { size: 18 })
const { t } = useLocale()
const label = computed(() => tcgLabel(t, props.game, 'type', props.type))
const color = computed(() => TCG_UI[props.game].typeColor[props.type] ?? '#999')
const icon = computed(() => TCG_UI[props.game].typeIcon[props.type])
// Light types take a dark symbol.
const ink = computed(() => (['Lightning', 'Colorless', 'Metal'].includes(props.type) ? '#2b2622' : '#fff'))
</script>

<template>
  <span class="pip" :style="{ '--pip': color, 'color': ink, 'width': `${size}px`, 'height': `${size}px`, 'fontSize': `${Math.round(size * 0.55)}px` }" :title="label" role="img" :aria-label="label">
    <UIcon v-if="icon" :name="icon" :style="{ width: `${Math.round(size * 0.62)}px`, height: `${Math.round(size * 0.62)}px` }" />
    <template v-else>{{ type[0] }}</template>
  </span>
</template>

<style scoped>
.pip {
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--pip) 55%, white), var(--pip) 70%);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.18),
    0 1px 2px rgba(0, 0, 0, 0.2);
  font-family: var(--font-display);
  font-weight: 700;
  line-height: 1;
}
</style>
