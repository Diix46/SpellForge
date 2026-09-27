<script setup lang="ts">
import { onMounted, ref, useTemplateRef, watch } from 'vue'

// A card's small scan, or a plain card back when the source has none (or
// announces one it does not serve).
const props = defineProps<{ src: string | null | undefined, alt?: string }>()
const broken = ref(false)
watch(() => props.src, () => (broken.value = false))
const img = useTemplateRef<HTMLImageElement>('img')
onMounted(() => {
  if (img.value?.complete && !img.value.naturalWidth)
    broken.value = true
})
</script>

<template>
  <img v-if="src && !broken" ref="img" :src="src" :alt="alt ?? ''" loading="lazy" decoding="async" @error="broken = true">
  <span v-else class="back" aria-hidden="true" />
</template>

<style scoped>
.back {
  display: block;
  border: 2px solid color-mix(in srgb, rgb(var(--accent-rgb-2)) 70%, white);
  background: linear-gradient(160deg, var(--color-surface-1), var(--color-surface-3));
}
</style>
