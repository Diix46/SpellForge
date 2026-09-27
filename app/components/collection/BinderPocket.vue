<script setup lang="ts">
import type { ChecklistCard, ChecklistVariant } from '#shared/collection'
import { ref, watch } from 'vue'
import { rarityShort } from '~/utils/games/tcg'

// One pocket of the binder: the card when owned (with how many), its ghost
// when missing. A tap shows the card up close; on hover (always on a touch
// screen), put one more in, take one out, wish for it, or add with options.
const props = defineProps<{ card: ChecklistCard, name: string, wished: boolean, game?: string }>()
const emit = defineEmits<{ add: [variant?: ChecklistVariant], remove: [], details: [], options: [], wish: [] }>()
const { t, rarityLabel } = useLocale()

// The pocket pops when a copy goes in.
const popping = ref(false)
watch(() => props.card.owned, (now, before) => {
  if (now > before) {
    popping.value = false
    requestAnimationFrame(() => (popping.value = true))
  }
})
</script>

<template>
  <div class="pocket" :class="{ owned: card.owned > 0, popping }" @animationend="popping = false">
    <button
      type="button"
      class="slot"
      :aria-label="`${name} #${card.number} — ${card.owned ? `×${card.owned}` : t('collection.missing')}. ${t('collection.binder.tapToSee')}`"
      @click="emit('details')"
    >
      <img :src="card.thumb" :alt="name" loading="lazy" decoding="async" draggable="false">
      <span v-if="!card.owned" class="num">{{ card.number }}</span>
      <span v-if="card.owned" class="qty">×{{ card.owned }}</span>
      <span class="plus" aria-hidden="true">+1</span>
    </button>
    <button type="button" class="add" :aria-label="`${t('collection.binder.addOne')} : ${name}`" :title="t('collection.binder.addOne')" @click="emit('add')">
      <UIcon name="i-lucide-plus" class="h-4 w-4" />
    </button>
    <!-- Several rarities of the card: each one's badge, its copies, a tap adds it. -->
    <div v-if="card.variants" class="rarities">
      <button
        v-for="(v, i) in card.variants"
        :key="i"
        type="button"
        class="rarity"
        :class="{ have: v.owned > 0 }"
        :title="`${rarityLabel(v.rarity ?? '', game)}${v.owned ? ` ×${v.owned}` : ''}`"
        :aria-label="`${name} — ${rarityLabel(v.rarity ?? '', game)} : ${t('collection.binder.addOne')}`"
        @click="emit('add', v)"
      >
        {{ rarityShort(v.rarity) }}<b v-if="v.owned">{{ v.owned }}</b>
      </button>
    </div>
    <div class="tools">
      <button v-if="card.owned" type="button" :aria-label="`${t('collection.binder.removeOne')} : ${name}`" :title="t('collection.binder.removeOne')" @click="emit('remove')">
        <UIcon name="i-lucide-minus" class="h-3.5 w-3.5" />
      </button>
      <button v-else type="button" :class="{ on: wished }" :disabled="wished" :aria-label="`${t('collection.wish.add')} : ${name}`" :title="t('collection.wish.add')" @click="emit('wish')">
        <UIcon name="i-lucide-heart" class="h-3.5 w-3.5" />
      </button>
      <button type="button" :aria-label="`${t('collection.binder.details')} : ${name}`" :title="t('collection.binder.details')" @click="emit('options')">
        <UIcon name="i-lucide-sliders-horizontal" class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.pocket {
  position: relative;
  min-width: 0;
}
.slot {
  position: relative;
  display: block;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 63 / 88;
  border-radius: 5% / 3.6%;
  /* The plastic sleeve: a faint sheen and an inner edge. */
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.1), transparent 40%), var(--color-surface-2);
  box-shadow:
    inset 0 0 0 1px var(--color-border-subtle),
    inset 0 2px 6px rgba(0, 0, 0, 0.08);
  touch-action: manipulation;
  -webkit-user-select: none;
  user-select: none;
  transition: transform 0.15s var(--ease-out, ease-out);
}
.slot:active {
  transform: scale(0.97);
}
.slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: grayscale(1);
  opacity: 0.22;
  transition:
    opacity 0.3s,
    filter 0.3s;
  pointer-events: none;
}
.owned .slot {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}
.owned .slot img {
  filter: none;
  opacity: 1;
}
.owned .slot::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    125deg,
    rgba(255, 255, 255, 0.22),
    transparent 30%,
    transparent 70%,
    rgba(255, 255, 255, 0.08)
  );
  pointer-events: none;
}
.slot:hover img {
  opacity: 0.55;
}
.owned .slot:hover img {
  opacity: 1;
}
.num {
  position: absolute;
  inset: auto 0 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  color: var(--color-text-mid);
}
.qty {
  position: absolute;
  z-index: 1;
  top: 6px;
  right: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(10, 10, 14, 0.8);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}
.plus {
  position: absolute;
  z-index: 2;
  top: 40%;
  left: 50%;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--ui-primary);
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  opacity: 0;
  transform: translate(-50%, 0);
  pointer-events: none;
}
.popping .slot {
  animation: settle 0.45s var(--ease-out, ease-out);
}
.popping .plus {
  animation: rise 0.7s ease-out;
}
@keyframes settle {
  0% {
    transform: translateY(-10%) scale(1.06);
  }
  60% {
    transform: translateY(1%) scale(0.99);
  }
}
@keyframes rise {
  0% {
    opacity: 0;
    transform: translate(-50%, 10px);
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -40px);
  }
}
.rarities {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 3px;
  margin-top: 4px;
}
.rarity {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 999px;
  background: var(--color-surface-1);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
}
.rarity:hover {
  border-color: rgb(var(--accent-rgb));
  color: var(--color-text-high);
}
.rarity.have {
  border-color: rgb(var(--accent-rgb));
  background: color-mix(in srgb, rgb(var(--accent-rgb)) 18%, var(--color-surface-1));
  color: var(--color-text-high);
}
.rarity b {
  font-weight: 700;
}
/* One more copy in: a round + on the pocket's corner. */
.add {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgb(var(--accent-rgb));
  color: #fff;
  box-shadow: var(--shadow-elev-2);
  opacity: 0;
  transition:
    opacity var(--dur-fast),
    transform var(--dur-fast) var(--ease-spring);
}
.pocket:hover .add,
.add:focus-visible {
  opacity: 1;
}
.add:hover {
  transform: scale(1.12);
}
@media (hover: none) {
  .add {
    opacity: 0.9;
  }
}
.tools {
  position: absolute;
  z-index: 3;
  top: 6px;
  left: 6px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}
.pocket:hover .tools,
.tools:focus-within {
  opacity: 1;
}
.tools button {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(10, 10, 14, 0.65);
  color: #fff;
}
.tools button:hover {
  background: rgba(10, 10, 14, 0.85);
}
.tools button.on {
  background: #d63b66;
}
/* On a touch screen: a long press opens the details, the toast undoes a tap. */
@media (hover: none) {
  .tools {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .popping .slot,
  .popping .plus {
    animation: none;
  }
}
</style>
