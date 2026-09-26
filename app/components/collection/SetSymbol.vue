<script setup lang="ts">
import { computed } from 'vue'

// A Magic set symbol in its rarity's colour, as printed on the card: black
// for commons, silver, gold, and the mythics' orange. The SVG is used as a
// mask (served by us: masks need the same origin), the colour paints it.
const props = withDefaults(defineProps<{ icon: string | null, rarity?: string | null, size?: number, title?: string }>(), { rarity: null, size: 18, title: '' })

const style = computed(() => ({
  'width': `${props.size}px`,
  'height': `${props.size}px`,
  '--symbol': props.icon ? `url("${props.icon}")` : 'none',
}))
</script>

<template>
  <span
    v-if="icon"
    class="set-symbol"
    :class="`set-symbol--${rarity ?? 'common'}`"
    :style="style"
    :title="title || undefined"
    role="img"
    :aria-label="title || undefined"
  />
</template>

<style scoped>
.set-symbol {
  display: inline-block;
  flex: 0 0 auto;
  vertical-align: middle;
  background: var(--color-text-high);
  -webkit-mask: var(--symbol) center / contain no-repeat;
  mask: var(--symbol) center / contain no-repeat;
}
.set-symbol--uncommon {
  background: linear-gradient(135deg, #5f6f7a, #d3dde4 50%, #5f6f7a);
}
.set-symbol--rare {
  background: linear-gradient(135deg, #8a6a24, #efd286 50%, #8a6a24);
}
.set-symbol--mythic {
  background: linear-gradient(135deg, #b0341a, #f5a043 50%, #b0341a);
}
.set-symbol--special,
.set-symbol--bonus {
  background: linear-gradient(135deg, #5b2b86, #c79be8 50%, #5b2b86);
}
</style>
