<script setup lang="ts">
import { ref } from 'vue'

// A card to show off: it tilts after the pointer and catches the light, a
// rainbow foil for the foils, a soft sheen for the others. Pure decoration
// over the image; still under reduced motion.
const props = withDefaults(defineProps<{ image: string | null, name: string, foil?: boolean }>(), { foil: false })

const el = ref<HTMLElement | null>(null)
const style = ref<Record<string, string>>({})
let frame = 0

function move(e: PointerEvent) {
  if (!el.value || matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  const r = el.value.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width
  const y = (e.clientY - r.top) / r.height
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    style.value = {
      '--rx': `${(0.5 - y) * 16}deg`,
      '--ry': `${(x - 0.5) * 20}deg`,
      '--mx': `${x * 100}%`,
      '--my': `${y * 100}%`,
      '--shine': '1',
    }
  })
}
function leave() {
  cancelAnimationFrame(frame)
  style.value = {}
}
</script>

<template>
  <div ref="el" class="holo" :class="{ foil: props.foil }" :style="style" @pointermove="move" @pointerleave="leave">
    <div class="card">
      <img v-if="image" :src="image" :alt="name" loading="lazy" decoding="async">
      <span v-else class="blank">{{ name }}</span>
      <span class="glare" aria-hidden="true" />
      <span v-if="foil" class="rainbow" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.holo {
  --rx: 0deg;
  --ry: 0deg;
  --mx: 50%;
  --my: 30%;
  --shine: 0;
  perspective: 900px;
}
.card {
  position: relative;
  overflow: hidden;
  aspect-ratio: 63 / 88;
  border-radius: 4.8% / 3.5%;
  background: var(--color-surface-3);
  box-shadow:
    0 18px 36px -18px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(255, 255, 255, 0.06);
  transform: rotateX(var(--rx)) rotateY(var(--ry));
  transform-style: preserve-3d;
  transition:
    transform 0.25s ease-out,
    box-shadow 0.25s ease-out;
}
.holo:hover .card {
  box-shadow:
    0 30px 50px -20px rgba(0, 0, 0, 0.8),
    0 0 0 1px rgba(255, 255, 255, 0.12);
}
.card img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.blank {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 12px;
  text-align: center;
  color: var(--color-text-muted);
}
/* The light where the pointer is. */
.glare {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at var(--mx) var(--my), rgba(255, 255, 255, 0.45), transparent 45%);
  mix-blend-mode: overlay;
  opacity: calc(0.25 + var(--shine) * 0.55);
  transition: opacity 0.3s ease;
  pointer-events: none;
}
/* A foil's rainbow, sliding with the angle. */
.rainbow {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    115deg,
    transparent 20%,
    rgba(255, 60, 120, 0.35) 36%,
    rgba(255, 220, 80, 0.35) 46%,
    rgba(80, 255, 170, 0.35) 56%,
    rgba(80, 160, 255, 0.35) 66%,
    transparent 80%
  );
  background-size: 250% 250%;
  background-position: var(--mx) var(--my);
  mix-blend-mode: color-dodge;
  opacity: calc(0.35 + var(--shine) * 0.45);
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none;
  }
}
</style>
