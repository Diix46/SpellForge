<script setup lang="ts">
// Prism: one stone, two faces. The left facet is One Piece's red, the right
// one Magic's gold, split by a line of light, as on the landing portal.
withDefaults(defineProps<{
  wordmark?: boolean
  size?: number
}>(), {
  wordmark: true,
  size: 28,
})

// Gradient ids must be unique per instance: the logo appears several times.
const uid = useId()
</script>

<template>
  <span class="group inline-flex items-center gap-2.5 select-none">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 40 40"
      class="shrink-0"
      role="img"
      aria-label="Prism"
    >
      <defs>
        <linearGradient :id="`${uid}-red`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#EF6B5D" />
          <stop offset="1" stop-color="#B42A23" />
        </linearGradient>
        <linearGradient :id="`${uid}-gold`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#F1D994" />
          <stop offset="1" stop-color="#B8903F" />
        </linearGradient>
      </defs>
      <!-- halo -->
      <path
        d="M20 3 L34 20 L20 37 L6 20 Z"
        :fill="`url(#${uid}-gold)`"
        opacity=".3"
        style="filter: blur(6px)"
        class="transition-opacity duration-300 group-hover:opacity-60"
      />
      <path d="M20 3 L20 37 L6 20 Z" :fill="`url(#${uid}-red)`" />
      <path d="M20 3 L34 20 L20 37 Z" :fill="`url(#${uid}-gold)`" />
      <path d="M20 3 L20 37" stroke="#FFF8EC" stroke-width="1" opacity=".55" />
    </svg>

    <span
      v-if="wordmark"
      class="font-display text-lg font-bold tracking-[4px] leading-none text-(--color-text-high)"
    >PRISM</span>
  </span>
</template>
