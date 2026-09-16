<script setup lang="ts">
import type { TideCard } from '~/utils/cardTide'
import { useTemplateRef } from 'vue'

// The hero's living backdrop: One Piece cards on the left, Magic cards on the
// right, piled over the whole frame (motion in useCardTide). The page's own
// content goes in the slot, above the pile; its reading panel carries
// `data-tide-pocket` so the pile flows around it. The pile is decoration:
// hidden from assistive technology, never focusable.
const props = defineProps<{
  op: TideCard[]
  mtg: TideCard[]
}>()

defineSlots<{
  default: (props: { op: TideCard | null, mtg: TideCard | null, clear: (side: TideCard['side']) => void }) => unknown
}>()

const root = useTemplateRef<HTMLElement>('root')
const overlay = useTemplateRef<HTMLElement>('overlay')
const wash = useTemplateRef<HTMLElement>('wash')
const { cards, shown, clear, on } = useCardTide(root, overlay, wash, () => ({ op: props.op, mtg: props.mtg }))

function reveal(e: Event) {
  (e.target as HTMLElement).classList.add('is-in')
}
</script>

<template>
  <section
    ref="root"
    class="tide"
    @pointermove="on.move"
    @pointerleave="on.leave"
    @pointerup="on.up"
    @pointercancel="on.cancel"
  >
    <div
      class="pile"
      aria-hidden="true"
      @pointerover="on.over"
      @pointerout="on.out"
      @pointerdown="on.down"
      @dragstart.prevent
    >
      <div
        v-for="(c, i) in cards"
        :key="i"
        v-memo="[c]"
        class="card"
        :class="`card--${c.side}`"
        :data-tide-card="i"
      >
        <div class="card-inner">
          <img :src="c.image" alt="" draggable="false" decoding="async" fetchpriority="low" @load="reveal">
        </div>
      </div>
    </div>
    <div ref="wash" class="wash" aria-hidden="true" />
    <div ref="overlay" class="overlay">
      <div class="seam" aria-hidden="true" />
      <slot :op="shown.op" :mtg="shown.mtg" :clear="clear" />
    </div>
  </section>
</template>

<style scoped>
@property --op-glow {
  syntax: '<color>';
  inherits: false;
  initial-value: transparent;
}
@property --mtg-glow {
  syntax: '<color>';
  inherits: false;
  initial-value: transparent;
}

.tide {
  position: relative;
  display: grid;
  overflow: hidden;
  isolation: isolate;
  /* Before the cards arrive: sunlit sand on the left, night on the right. */
  background:
    radial-gradient(60% 70% at 0% 30%, rgba(233, 167, 44, 0.22), transparent 70%),
    radial-gradient(60% 70% at 100% 80%, rgba(138, 106, 212, 0.2), transparent 70%),
    linear-gradient(90deg, #1b120a 0%, #0f0b0d 50%, #09080f 100%);
  user-select: none;
}

/* ---- pile ---- */
.pile {
  position: absolute;
  z-index: 0;
  inset: 0;
  /* Gaps between cards let the pointer through; the cards take it back. */
  pointer-events: none;
}
.card {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--cw, 160px);
  height: var(--ch, 224px);
  transform-origin: center;
  backface-visibility: hidden;
  cursor: grab;
  pointer-events: auto;
}
.card:active {
  cursor: grabbing;
}
.card-inner {
  width: 100%;
  height: 100%;
  animation: breathe var(--bd, 9s) var(--bdl, 0s) ease-in-out infinite alternate;
}
.card img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4.8% / 3.5%;
  opacity: 0;
  box-shadow:
    0 1px 1px rgba(0, 0, 0, 0.5),
    0 14px 34px -12px rgba(0, 0, 0, 0.8);
  transition: opacity 0.5s ease;
  -webkit-user-drag: none;
}
.card img.is-in {
  opacity: 1;
}
/* One Piece cards read as printed stock under daylight, Magic ones as foil at night. */
.card--op img {
  box-shadow:
    0 1px 1px rgba(40, 20, 6, 0.55),
    0 14px 30px -12px rgba(30, 14, 4, 0.85);
}
.card--mtg img {
  box-shadow:
    0 0 0 1px rgba(212, 175, 95, 0.18),
    0 14px 34px -12px rgba(0, 0, 0, 0.85);
}
@keyframes breathe {
  to {
    transform: translate3d(0, -5px, 0) rotate(1.2deg) scale(1.012);
  }
}

/* ---- light: a warm day on the left, a cool night on the right, a calm pocket in the middle ---- */
.wash {
  --op-glow: transparent;
  --mtg-glow: transparent;
  position: absolute;
  z-index: 1;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(34% 50% at 13% 52%, color-mix(in srgb, var(--op-glow) 26%, transparent), transparent 72%),
    radial-gradient(34% 50% at 87% 52%, color-mix(in srgb, var(--mtg-glow) 26%, transparent), transparent 72%),
    radial-gradient(56% 50% at 50% 52%, rgba(9, 7, 12, 0.84) 0%, rgba(9, 7, 12, 0.38) 58%, transparent 80%),
    linear-gradient(0deg, rgba(9, 7, 12, 0.9) 0%, transparent 22%),
    linear-gradient(180deg, rgba(9, 7, 12, 0.72) 0%, transparent 16%),
    linear-gradient(90deg, rgba(255, 214, 150, 0.1) 0%, transparent 46%, transparent 54%, rgba(22, 14, 48, 0.3) 100%);
  transition:
    --op-glow 1.2s ease,
    --mtg-glow 1.2s ease;
}

/* ---- content ---- */
.overlay {
  --tide-px: 0;
  --tide-py: 0;
  --tide-ratio: 2;
  position: relative;
  z-index: 2;
  display: grid;
  pointer-events: none;
}
/* The seam between the worlds leans away from the pointer. */
.seam {
  position: absolute;
  inset: 0;
  transform: translate3d(calc(var(--tide-px) * -6%), 0, 0);
}
.seam::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(50% - 1px);
  width: 2px;
  background: linear-gradient(180deg, transparent 0%, #c9312a 20%, #f1d994 50%, #d4af5f 80%, transparent 100%);
  box-shadow: 0 0 18px rgba(241, 217, 148, 0.5);
  opacity: 0.75;
}

@media (prefers-reduced-motion: reduce) {
  .card-inner {
    animation: none;
  }
  .card img {
    transition: none;
  }
}
</style>
