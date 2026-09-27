<script setup lang="ts">
import type { ShowcaseArt } from '~~/server/api/tcg/[game]/showcase.get'
import type { TcgGameId } from '#shared/tcg/types'
import { computed } from 'vue'

// A game's mascots beside a page's title: Pikachu, Mew, Eevee… each one its
// own card's illustration in a round bubble, a row that fans out on hover;
// each leads to its card. Only for a game whose showcase is its mascots
// (Pokémon); nothing otherwise.
const props = withDefaults(defineProps<{ game: TcgGameId, count?: number }>(), { count: 6 })
const { locale } = useLocale()
const { data } = useFetch<{ arts: ShowcaseArt[] }>(() => `/api/tcg/${props.game}/showcase`, {
  query: computed(() => ({ lang: locale.value })),
  server: false,
  lazy: true,
  default: () => ({ arts: [] }),
})
const mascots = computed(() => (props.game === 'pokemon' ? (data.value?.arts ?? []).slice(0, props.count) : []))
</script>

<template>
  <div v-if="mascots.length" class="mascots">
    <NuxtLink
      v-for="(m, i) in mascots"
      :key="m.path"
      :to="m.path"
      class="bubble"
      :style="{ '--i': i, 'backgroundImage': `url('${m.thumb}')` }"
      :title="m.name"
      :aria-label="m.name"
    />
  </div>
</template>

<style scoped>
.mascots {
  display: flex;
  align-items: center;
  padding-left: 14px;
}
.bubble {
  flex: none;
  width: 58px;
  aspect-ratio: 1;
  margin-left: -14px;
  border: 3px solid var(--color-surface-1);
  border-radius: 50%;
  background-color: var(--color-surface-3);
  background-repeat: no-repeat;
  /* The card's illustration window, under its name. */
  background-size: 190% auto;
  /* Centred on the illustration window (11–47 % of the card's height). */
  background-position: 50% 16%;
  box-shadow: var(--shadow-elev-2);
  animation: pop 0.5s var(--ease-spring) both;
  animation-delay: calc(var(--i) * 70ms);
  transition:
    margin 0.3s var(--ease-out),
    transform 0.3s var(--ease-spring);
}
.bubble:first-child {
  width: 72px;
}
.mascots:hover .bubble {
  margin-left: -4px;
}
.bubble:hover,
.bubble:focus-visible {
  z-index: 1;
  transform: translateY(-6px) scale(1.12);
}
@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
}
@media (prefers-reduced-motion: reduce) {
  .bubble {
    animation: none;
    transition: none;
  }
}
</style>
