<script setup lang="ts">
import { computed } from 'vue'

// Renders a mana cost string like "{2}{W}{U/B}{T}" as a row of pips.
const props = defineProps<{
  cost: string
  size?: number
}>()

const symbols = computed(() =>
  (props.cost.match(/\{[^}]+\}/g) ?? []).map(s => s.replace(/[{}]/g, '')),
)
</script>

<template>
  <span
    v-if="symbols.length"
    class="inline-flex items-center gap-0.5"
  >
    <ManaSymbol
      v-for="(s, i) in symbols"
      :key="i"
      :sym="s"
      :size="size"
    />
  </span>
</template>
