<script setup lang="ts">
import type { CollectionCopy } from '#shared/collection'
import { computed, ref } from 'vue'
import { unitValue } from '#shared/collection'

// One copy line in the grid: the card, how many, its finish (a foil shimmers),
// condition and set, and what it is worth.
// While picking several lines, `selected` says whether this one is.
const props = defineProps<{ copy: CollectionCopy, name: string, selected?: boolean | null }>()
defineEmits<{ open: [copy: CollectionCopy] }>()

const { t, locale } = useLocale()
const value = computed(() => {
  const unit = unitValue(props.copy.card, props.copy.finish)
  return unit == null ? null : (unit * props.copy.quantity).toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: 'EUR' })
})
const shiny = computed(() => props.copy.finish !== 'nonfoil')

// A foil under the mouse tilts towards it and the light follows the pointer.
const art = ref<HTMLElement | null>(null)
const tilting = ref(false)
function tilt(e: PointerEvent) {
  if (!shiny.value || e.pointerType !== 'mouse' || !art.value || matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  const r = art.value.getBoundingClientRect()
  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
  const st = art.value.style
  st.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
  st.setProperty('--my', `${(y * 100).toFixed(1)}%`)
  st.setProperty('--rx', `${((0.5 - y) * 14).toFixed(2)}deg`)
  st.setProperty('--ry', `${((x - 0.5) * 18).toFixed(2)}deg`)
  tilting.value = true
}
function untilt() {
  tilting.value = false
}
</script>

<template>
  <button type="button" class="tile" :class="{ 'is-selected': selected }" :aria-label="`${name}, ×${copy.quantity}`" :aria-pressed="selected ?? undefined" @click="$emit('open', copy)">
    <span ref="art" class="art" :class="{ shiny, etched: copy.finish === 'etched', tilting }" @pointermove="tilt" @pointerleave="untilt">
      <span v-if="selected != null" class="pick" aria-hidden="true"><UIcon v-if="selected" name="i-lucide-check" class="h-3.5 w-3.5" /></span>
      <img v-if="copy.card" :src="copy.card.thumb" :alt="name" loading="lazy" decoding="async">
      <span v-else class="missing">{{ t('collection.unknownCard') }}</span>
      <span v-if="copy.quantity > 1" class="qty">×{{ copy.quantity }}</span>
      <span v-if="shiny" class="finish">{{ t(`collection.finish.${copy.finish}`) }}</span>
    </span>
    <span class="meta">
      <CollectionSetSymbol v-if="copy.card" :icon="copy.card.setIcon" :rarity="copy.card.rarity" :size="14" :title="copy.card.setName ?? ''" />
      <span class="code">{{ copy.card?.set.toUpperCase() }} · {{ copy.card?.number }}</span>
      <span class="lang">{{ copy.card?.lang.toUpperCase() }}</span>
      <span class="cond" :title="t(`collection.condition.${copy.condition}`)">{{ copy.condition }}</span>
    </span>
    <span class="name">{{ name }}</span>
    <span v-if="value" class="value">{{ value }}</span>
  </button>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  text-align: left;
}
.art {
  position: relative;
  display: block;
  aspect-ratio: 63 / 88;
  overflow: hidden;
  border-radius: 4.5% / 3.3%;
  background: var(--color-surface-2);
  box-shadow: var(--shadow-elev-1);
  transition:
    transform var(--dur) var(--ease-out),
    box-shadow var(--dur) var(--ease-out);
}
.tile:hover .art,
.tile:focus-visible .art {
  transform: translateY(-3px);
  box-shadow: var(--shadow-elev-2);
}
.art img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
/* A foil catches the light: a rainbow sheen drifts across it. */
.art.shiny::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    115deg,
    transparent 20%,
    rgba(255, 90, 160, 0.28) 35%,
    rgba(90, 200, 255, 0.28) 50%,
    rgba(255, 230, 90, 0.28) 65%,
    transparent 80%
  );
  background-size: 250% 250%;
  mix-blend-mode: color-dodge;
  animation: sheen 5s ease-in-out infinite;
  pointer-events: none;
}
.art.etched::after {
  background: linear-gradient(
    115deg,
    transparent 25%,
    rgba(255, 215, 150, 0.32) 45%,
    rgba(210, 170, 255, 0.28) 60%,
    transparent 80%
  );
  background-size: 250% 250%;
}
@keyframes sheen {
  0%,
  100% {
    background-position: 100% 0;
  }
  50% {
    background-position: 0 100%;
  }
}
/* Under the mouse: tilted towards it, the sheen and a glare following it. */
.art.shiny::before {
  content: '';
  position: absolute;
  z-index: 1;
  inset: 0;
  background: radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(255, 255, 255, 0.55), transparent 42%);
  mix-blend-mode: soft-light;
  opacity: 0;
  transition: opacity 0.25s;
  pointer-events: none;
}
.art.shiny.tilting {
  transform: perspective(700px) rotateX(var(--rx, 0)) rotateY(var(--ry, 0)) translateY(-3px) scale(1.03);
  box-shadow: var(--shadow-elev-2);
  transition: transform 0.08s linear;
}
.art.shiny.tilting::before {
  opacity: 1;
}
.art.shiny.tilting::after {
  animation: none;
  background-position: var(--mx, 50%) var(--my, 50%);
}
@media (prefers-reduced-motion: reduce) {
  .art.shiny::after {
    animation: none;
  }
}
.missing {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 10px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
}
.qty {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(10, 12, 14, 0.82);
  color: #fff;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
}
.finish {
  position: absolute;
  left: 6px;
  bottom: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: linear-gradient(90deg, #ff7ab8, #7ad2ff, #ffe27a);
  color: #1b1f22;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.meta {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 11px;
  color: var(--color-text-muted);
}
.code {
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lang,
.cond {
  padding: 0 4px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
}
.cond {
  margin-left: auto;
}
.name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-high);
}
.value {
  margin-top: -3px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--accent-text);
}
.pick {
  position: absolute;
  z-index: 2;
  top: 7px;
  left: 7px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: rgba(10, 10, 14, 0.35);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  color: #fff;
}
.is-selected .pick {
  border-color: var(--ui-primary);
  background: var(--ui-primary);
}
.is-selected .art {
  outline: 3px solid var(--ui-primary);
  outline-offset: 2px;
}
</style>
