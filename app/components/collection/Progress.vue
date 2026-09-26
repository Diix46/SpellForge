<script setup lang="ts">
import { computed } from 'vue'

// A completion bar: the universe's colours while it fills, gold once full.
const props = withDefaults(defineProps<{ owned: number, total: number, size?: 'sm' | 'lg' }>(), { size: 'sm' })
const ratio = computed(() => (props.total ? Math.min(1, props.owned / props.total) : 0))
const done = computed(() => props.total > 0 && props.owned >= props.total)
</script>

<template>
  <div
    class="progress"
    :class="[`progress--${size}`, { 'is-done': done }]"
    role="progressbar"
    :aria-valuenow="owned"
    aria-valuemin="0"
    :aria-valuemax="total"
  >
    <span class="fill" :style="{ transform: `scaleX(${ratio})` }" />
  </div>
</template>

<style scoped>
.progress {
  position: relative;
  overflow: hidden;
  height: 6px;
  border-radius: 999px;
  background: var(--color-surface-3);
}
.progress--lg {
  height: 10px;
}
.fill {
  position: absolute;
  inset: 0;
  transform-origin: left;
  border-radius: inherit;
  background: linear-gradient(90deg, rgb(var(--accent-rgb)), rgb(var(--accent-rgb-2, var(--accent-rgb))));
  transition: transform 0.6s var(--ease-out, ease-out);
}
.is-done .fill {
  background: linear-gradient(90deg, #a8801f, #f0d27a 45%, #c79a2e);
  box-shadow: 0 0 12px rgba(240, 200, 100, 0.45);
}
</style>
