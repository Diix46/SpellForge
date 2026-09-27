<script setup lang="ts">
import type { TcgCard, TcgGameId } from '#shared/tcg/types'
import { computed, ref, watch } from 'vue'
import { TCG_UI } from '~/utils/games/tcg'

// A card in a grid: the scan, a lift on hover, its copies in the deck and a
// quick add. Opens the card's sheet on click.
const props = withDefaults(defineProps<{
  game: TcgGameId
  card: TcgCard
  index?: number
  /** Copies in the deck; null outside one. */
  quantity?: number | null
  addable?: boolean
}>(), { index: 0, quantity: null, addable: false })

const emit = defineEmits<{
  open: [card: TcgCard]
  add: [card: TcgCard, from: HTMLElement]
}>()

const { t } = useLocale()
const aspect = computed(() => TCG_UI[props.game].aspect)
const price = computed(() => props.card.price ?? props.card.priceFoil)
const frame = computed(() => TCG_UI[props.game].frame?.(props.card) ?? null)
// A scan the source announced but does not serve: the blank card instead.
const broken = ref(false)
watch(() => props.card.thumb, () => (broken.value = false))
</script>

<template>
  <article class="tile" :class="{ framed: frame }" :style="{ '--i': Math.min(index, 24), '--frame': frame ?? undefined }">
    <button type="button" class="face" :style="{ aspectRatio: aspect }" :aria-label="card.name" @click="emit('open', card)">
      <img v-if="card.thumb && !broken" :src="card.thumb" :alt="card.name" :class="{ landscape: card.landscape }" loading="lazy" decoding="async" @error="broken = true">
      <span v-else class="blank">
        <span class="blank-name">{{ card.name }}</span>
        <span class="font-mono">{{ card.set }} · {{ card.number }}</span>
      </span>
      <span v-if="quantity" class="qty">×{{ quantity }}</span>
    </button>
    <UButton
      v-if="addable"
      class="add"
      color="primary"
      size="xs"
      icon="i-lucide-plus"
      :aria-label="`${t('tcg.add')} ${card.name}`"
      @click="emit('add', card, $event.currentTarget as HTMLElement)"
    />
    <p class="cap">
      <span class="name">{{ card.name }}</span>
      <span class="meta">
        <span class="font-mono">{{ card.set }} · {{ card.number }}</span>
        <span v-if="price != null" class="price">{{ price.toFixed(2) }} €</span>
      </span>
    </p>
  </article>
</template>

<style scoped>
.tile {
  position: relative;
  min-width: 0;
  animation: tile-in var(--dur-slow) var(--ease-out) both;
  animation-delay: calc(var(--i) * 18ms);
}
@keyframes tile-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}
.face {
  position: relative;
  display: block;
  width: 100%;
  overflow: hidden;
  border-radius: 4.5% / 3.3%;
  background: var(--color-surface-3);
  box-shadow: var(--shadow-elev-2);
  transition:
    transform var(--dur) var(--ease-out),
    box-shadow var(--dur) var(--ease-out);
}
.face:hover,
.face:focus-visible {
  transform: translateY(-4px) rotate(-0.6deg);
  box-shadow: var(--shadow-elev-3);
}
.face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
/* A Battlefield, turned to stand in the grid. */
.face img.landscape {
  width: calc(100% * var(--turn, 1.396));
  height: auto;
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  rotate: 90deg;
}
/* No scan published yet: the card's name on a plain card back. */
.blank {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  padding: 12px;
  border: 6px solid color-mix(in srgb, rgb(var(--accent-rgb-2)) 70%, white);
  border-radius: inherit;
  background: linear-gradient(160deg, var(--color-surface-1), var(--color-surface-3));
  text-align: center;
  font-size: 11px;
  color: var(--color-text-muted);
}
.blank-name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-high);
}
/* The card's frame colour in its game, as a rim and a glow on hover. */
.framed .face {
  box-shadow:
    0 0 0 2px var(--frame),
    var(--shadow-elev-2);
}
.framed .face:hover,
.framed .face:focus-visible {
  box-shadow:
    0 0 0 2px var(--frame),
    0 0 22px -2px color-mix(in srgb, var(--frame) 70%, transparent),
    var(--shadow-elev-3);
}
.qty {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgb(var(--accent-rgb));
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  box-shadow: var(--shadow-elev-1);
}
.add {
  position: absolute;
  top: 6px;
  right: 6px;
  opacity: 0;
  transition: opacity var(--dur-fast);
}
.tile:hover .add,
.add:focus-visible {
  opacity: 1;
}
@media (hover: none) {
  .add {
    opacity: 1;
  }
}
.cap {
  display: grid;
  gap: 1px;
  margin: 7px 2px 0;
  font-size: 12.5px;
  line-height: 1.3;
}
.name {
  overflow: hidden;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-high);
}
.meta {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-muted);
}
.price {
  font-family: var(--font-mono);
  color: var(--color-text-mid);
}
</style>
