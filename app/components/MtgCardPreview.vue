<script setup lang="ts">
import type { ResolvedCard } from '~/composables/useScryfall'
import { computed } from 'vue'
import { useLocale } from '~/composables/useLocale'
import { useSpotlight } from '~/composables/useSpotlight'

const props = defineProps<{
  card: ResolvedCard
  index?: number
  commander?: boolean
}>()
const emit = defineEmits<{ details: [card: ResolvedCard] }>()

const { t } = useLocale()
const { el: spotEl } = useSpotlight()

const delay = computed(() => `${Math.min((props.index ?? 0) * 22, 500)}ms`)
</script>

<template>
  <div
    class="fade-up"
    :style="{ animationDelay: delay }"
  >
    <!-- Error / missing -->
    <div
      v-if="card.error || !card.imageUrl"
      class="flex aspect-[63/88] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-(--color-error)/40 bg-(--color-error)/10 p-2 text-center"
    >
      <UIcon
        name="i-lucide-image-off"
        class="mb-1 h-6 w-6 text-(--color-error)"
      />
      <p class="text-xs font-medium leading-tight text-(--color-error)">
        {{ card.entry.name }}
      </p>
      <p class="mt-1 text-[10px] leading-tight text-(--color-text-muted)">
        {{ t('card.notFound') }}
      </p>
    </div>

    <!-- Card -->
    <button
      v-else
      ref="spotEl"
      type="button"
      class="holo-sheen group relative block aspect-[63/88] w-full overflow-hidden rounded-[var(--radius-lg)] text-left transition-transform duration-200 hover:z-10 hover:scale-[1.04]"
      :class="commander ? 'ring-2 ring-(--accent-border)' : ''"
      :style="{ boxShadow: commander ? 'var(--accent-glow-soft), var(--shadow-elev-2)' : 'var(--shadow-elev-2)' }"
      @click="emit('details', card)"
    >
      <img
        :src="card.imageUrl"
        :alt="card.card?.name ?? card.entry.name"
        class="block h-full w-full rounded-[var(--radius-lg)] object-cover"
        loading="lazy"
      >

      <!-- reactive accent ring on hover -->
      <div
        class="pointer-events-none absolute inset-0 rounded-[var(--radius-lg)] opacity-0 ring-1 ring-(--accent-border) transition-opacity duration-200 group-hover:opacity-100"
        :style="{ boxShadow: 'var(--accent-glow-soft)' }"
      />

      <!-- commander crown -->
      <div
        v-if="commander"
        class="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-(--color-bg-base)"
        :style="{ background: 'var(--gradient-accent)' }"
      >
        <UIcon
          name="i-lucide-crown"
          class="h-3 w-3"
        />
        {{ t('commander.label') }}
      </div>

      <!-- qty -->
      <div
        v-if="card.entry.quantity > 1"
        class="absolute -left-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-(--color-bg-base) shadow-[var(--accent-glow-soft)]"
        :style="{ background: 'var(--accent)' }"
      >
        {{ card.entry.quantity }}
      </div>

      <!-- zoom hint on hover -->
      <div
        class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      >
        <span class="grid h-9 w-9 place-items-center rounded-full bg-black/60 backdrop-blur-sm">
          <UIcon
            name="i-lucide-search"
            class="h-4 w-4 text-white"
          />
        </span>
      </div>

      <!-- lang pill -->
      <span
        class="absolute bottom-1.5 right-1.5 rounded-full bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold backdrop-blur-sm transition-opacity duration-200"
        :class="card.lang === 'fr' ? 'text-(--accent-text)' : 'text-(--color-text-mid)'"
      >
        {{ card.lang === 'fr' ? 'FR' : card.lang.toUpperCase() }}
      </span>

      <!-- DFC badge -->
      <span
        v-if="card.backImageUrl"
        class="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-(--color-text-mid) opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100"
      >
        2 faces
      </span>
    </button>
  </div>
</template>
