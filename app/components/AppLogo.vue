<script setup lang="ts">
withDefaults(defineProps<{
  wordmark?: boolean
  size?: number
}>(), {
  wordmark: true,
  size: 28,
})
</script>

<template>
  <span class="group inline-flex items-center gap-2.5 select-none">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 40 40"
      class="shrink-0"
      role="img"
      aria-label="Spellforge"
    >
      <defs>
        <linearGradient
          id="prismCyan"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop
            offset="0"
            stop-color="#7DEEFF"
          />
          <stop
            offset="1"
            stop-color="#06C7E6"
          />
        </linearGradient>
        <linearGradient
          id="prismSilver"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop
            offset="0"
            stop-color="#EBEDF3"
          />
          <stop
            offset="1"
            stop-color="#8A93A6"
          />
        </linearGradient>
      </defs>
      <!-- duplicate-blur halo -->
      <path
        d="M20 3 L34 20 L20 37 L6 20 Z"
        fill="url(#prismCyan)"
        opacity=".35"
        style="filter: blur(6px)"
        class="transition-opacity duration-300 group-hover:opacity-70"
      />
      <!-- left (cyan) facet -->
      <path
        d="M20 3 L20 37 L6 20 Z"
        fill="url(#prismCyan)"
      />
      <!-- right (silver) facet -->
      <path
        d="M20 3 L34 20 L20 37 Z"
        fill="url(#prismSilver)"
      />
      <!-- specular seam -->
      <path
        d="M20 3 L20 37"
        stroke="#FFFFFF"
        stroke-width="1"
        opacity=".4"
      />
    </svg>

    <span
      v-if="wordmark"
      class="font-display text-lg font-bold tracking-[2px] leading-none"
    >
      <span class="text-(--color-text-high)">SPELL</span><span
        class="text-gradient"
        style="--accent-rgb: 125, 238, 255; --accent-rgb-2: 235, 237, 243;"
      >FORGE</span>
    </span>
  </span>
</template>
