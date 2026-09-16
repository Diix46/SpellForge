<script setup lang="ts">
import type { OptcgCard } from '#shared/optcg/types'
import { computed } from 'vue'
import { MIN_LEGAL_BLOCK } from '#shared/optcg/rules'
import { optcgColorFill } from '~/utils/optcgColors'

// A One Piece card as a WANTED poster pinned askew: the art, the name in
// poster capitals, and the card's power written as its bounty. Straightens and
// lifts under the pointer; the add button sits on the poster's corner.
const props = withDefaults(defineProps<{
  card: OptcgCard
  /** Copies already in the deck, all arts together. */
  quantity?: number
  /** Index in the grid, for a stable, varied tilt. */
  index?: number
  addable?: boolean
  /** Site language, to flag cards Bandai has not translated yet. */
  lang?: 'fr' | 'en'
}>(), { quantity: 0, index: 0, addable: false, lang: 'fr' })

const emit = defineEmits<{
  open: [card: OptcgCard]
  add: [card: OptcgCard, from: HTMLElement]
}>()

const { t } = useLocale()

// Posters are never pinned straight; the pattern repeats every seven cards.
const TILTS = [-1.6, 0.9, -0.5, 1.4, -1.1, 0.4, 1.8]
const tilt = computed(() => `${TILTS[props.index % TILTS.length]}deg`)

const bounty = computed(() => {
  const p = props.card.power
  return p == null ? null : `${p.toLocaleString(props.lang === 'fr' ? 'fr-FR' : 'en-US')}`
})
const rotated = computed(() => props.card.block !== null && props.card.block < MIN_LEGAL_BLOCK)
const untranslated = computed(() => props.lang === 'fr' && props.card.lang === 'en')
const fill = computed(() => optcgColorFill(props.card.colors))
const label = computed(() => `${props.card.name}, ${props.card.number}, ${t(`optcg.category.${props.card.category}`)}`)

function onAdd(e: MouseEvent) {
  emit('add', props.card, e.currentTarget as HTMLElement)
}
</script>

<template>
  <article class="poster" :style="{ '--tilt': tilt }">
    <span class="pin" aria-hidden="true" />
    <button type="button" class="poster-body" :aria-label="label" @click="emit('open', card)">
      <span class="wanted" aria-hidden="true">{{ t('optcg.wanted') }}</span>
      <span class="art">
        <img :src="card.image" :alt="card.name" loading="lazy" decoding="async" width="600" height="838">
      </span>
      <span class="name">{{ card.name }}</span>
      <span class="foot">
        <span class="bounty">
          <template v-if="bounty">
            <span class="berry" aria-hidden="true">฿</span>{{ bounty }}
          </template>
          <template v-else-if="card.cost != null">
            {{ t('optcg.cost') }} {{ card.cost }}
          </template>
        </span>
        <span class="num">{{ card.number }}</span>
      </span>
      <span class="stripe" :style="{ background: fill }" aria-hidden="true" />
    </button>

    <span v-if="card.banned" class="stamp stamp--ban">{{ t('optcg.banned') }}</span>
    <span v-else-if="rotated" class="stamp">{{ t('optcg.rotated') }}</span>
    <span v-if="untranslated" class="flag">{{ t('optcg.enOnly') }}</span>

    <span v-if="quantity" class="qty" :aria-label="`${quantity} ${t('optcg.detail.inDeck')}`">×{{ quantity }}</span>
    <button
      v-if="addable"
      type="button"
      class="add"
      :aria-label="`${t('optcg.add.button')} ${card.name}`"
      @click.stop="onAdd"
    >
      <UIcon name="i-lucide-plus" class="h-4 w-4" />
    </button>
  </article>
</template>

<style scoped>
.poster {
  position: relative;
  transform: rotate(var(--tilt));
  transition: transform var(--dur) var(--ease-spring);
}
.poster:hover,
.poster:focus-within {
  transform: rotate(0deg) translateY(-4px) scale(1.02);
  z-index: 2;
}
.poster-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  padding: 18px 8px 10px;
  border: 1px solid rgba(58, 38, 22, 0.35);
  border-radius: 2px;
  background: var(--u-texture, none), linear-gradient(180deg, #fbf3e3, #f1e2c4);
  background-blend-mode: multiply, normal;
  box-shadow:
    0 1px 0 rgba(58, 38, 22, 0.1),
    0 10px 20px -12px rgba(58, 38, 22, 0.55);
  text-align: left;
  color: #231708;
  overflow: hidden;
}
.poster:hover .poster-body {
  box-shadow:
    0 1px 0 rgba(58, 38, 22, 0.1),
    0 18px 30px -14px rgba(58, 38, 22, 0.6);
}
.pin {
  position: absolute;
  top: 5px;
  left: 50%;
  z-index: 3;
  width: 11px;
  height: 11px;
  translate: -50% 0;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ef6b5d, #c9312a 55%, #7a1a14);
  box-shadow: 0 2px 3px rgba(35, 23, 8, 0.45);
}
.wanted {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 11px;
  letter-spacing: 0.3em;
  text-align: center;
  line-height: 1;
}
.art {
  display: block;
  aspect-ratio: 600 / 838;
  border: 2px solid #3a2616;
  background: #e2cfab;
  overflow: hidden;
}
.art img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: sepia(0.08) contrast(1.03);
}
.name {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 14px;
  line-height: 1.1;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
}
.bounty {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 13px;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.berry {
  margin-right: 2px;
  color: #a4231d;
}
.num {
  font-family: var(--font-mono);
  font-size: 10px;
  color: #6b5236;
}
.stripe {
  height: 4px;
  margin: 1px -8px -10px;
}
.stamp {
  position: absolute;
  top: 38%;
  left: 50%;
  z-index: 3;
  padding: 2px 8px;
  translate: -50% 0;
  rotate: -14deg;
  border: 2px solid #6b5236;
  border-radius: 3px;
  background: rgba(251, 243, 227, 0.85);
  color: #6b5236;
  font-family: 'Anton', Impact, sans-serif;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  pointer-events: none;
}
.stamp--ban {
  border-color: #a4231d;
  color: #a4231d;
}
.flag {
  position: absolute;
  top: 24px;
  right: 10px;
  z-index: 3;
  padding: 1px 5px;
  border-radius: 2px;
  background: #1d6f92;
  color: #fbf4e6;
  font-size: 9.5px;
  font-weight: 600;
  pointer-events: none;
}
.qty {
  position: absolute;
  top: 24px;
  left: 10px;
  z-index: 3;
  min-width: 26px;
  padding: 1px 6px;
  border-radius: 2px;
  background: #231708;
  color: #e9c270;
  font-family: 'Anton', Impact, sans-serif;
  font-size: 13px;
  text-align: center;
  pointer-events: none;
}
.add {
  position: absolute;
  right: -6px;
  bottom: 30px;
  z-index: 4;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 2px solid #231708;
  border-radius: 50%;
  background: #c9312a;
  color: #fff8ec;
  box-shadow: 2px 2px 0 #231708;
  opacity: 0;
  transform: scale(0.6);
  transition:
    opacity var(--dur-fast) ease,
    transform var(--dur) var(--ease-spring);
}
.poster:hover .add,
.poster:focus-within .add,
.add:focus-visible {
  opacity: 1;
  transform: scale(1);
}
.add:active {
  transform: scale(0.9);
}
@media (hover: none) {
  .add {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
