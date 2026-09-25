<script setup lang="ts">
import type { DeckFingerprint } from '~/composables/useDeckFingerprints'
import type { Deck } from '~/composables/useDeckStore'
import { computed } from 'vue'
import { isDefaultDeckName } from '#shared/decks'

// A deck on the dashboard, dressed as its world whatever the page's mode: a
// One Piece deck is a poster pinned askew, with its Leader's bounty; a Magic
// deck is a sleeved deck on the mat, with its counter. Same size, same grid,
// same actions.
const props = defineProps<{ deck: Deck, fingerprint: DeckFingerprint }>()
const emit = defineEmits<{
  open: [id: string]
  duplicate: [id: string]
  delete: [id: string, name: string]
  rename: [id: string]
}>()

const { t, locale, formatShortDate } = useLocale()

// The clickable tile borrows the deck name as its accessible name.
const titleId = useId()

const isOp = computed(() => props.deck.game === 'optcg')
const fp = computed(() => props.fingerprint)
const bounty = computed(() => {
  const p = fp.value.leader?.power
  return p == null ? null : p.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US')
})
const progress = computed(() => (fp.value.complete ? t('tile.legalSize') : `${fp.value.count} / ${fp.value.target}`))
// A deck without a name of its own goes by its commander or Leader.
const title = computed(() => (isDefaultDeckName(props.deck.name) && fp.value.lead) || props.deck.name)

const menuItems = computed(() => [
  [{ label: t('tile.open'), icon: 'i-lucide-folder-open', onSelect: () => emit('open', props.deck.id) }],
  [
    { label: t('tile.rename'), icon: 'i-lucide-pencil', onSelect: () => emit('rename', props.deck.id) },
    { label: t('tile.duplicate'), icon: 'i-lucide-copy', onSelect: () => emit('duplicate', props.deck.id) },
  ],
  [{ label: t('tile.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete', props.deck.id, props.deck.name) }],
])
</script>

<template>
  <div
    role="button"
    tabindex="0"
    :aria-labelledby="titleId"
    class="tile"
    :class="isOp ? 'tile--op' : 'tile--mtg'"
    :style="fp.accent"
    @click="emit('open', deck.id)"
    @keydown.enter.self.prevent="emit('open', deck.id)"
    @keydown.space.self.prevent="emit('open', deck.id)"
  >
    <span v-if="isOp" class="pin" aria-hidden="true" />
    <span v-else class="token" aria-hidden="true" />
    <!-- Magic: the commander's art across the top of the deck box. -->
    <div v-if="!isOp && fp.art" class="art" aria-hidden="true">
      <img :src="fp.art" alt="" loading="lazy">
    </div>

    <div class="head">
      <span class="world">{{ isOp ? 'One Piece' : 'Magic' }}</span>
      <UDropdownMenu :items="menuItems" @click.stop>
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('tile.menu')"
          class="menu"
          @click.stop
        />
      </UDropdownMenu>
    </div>

    <div class="main">
      <img v-if="isOp && fp.leader" :src="fp.leader.thumb" alt="" class="leader" loading="lazy">
      <div class="min-w-0">
        <h2 :id="titleId" class="name">
          {{ title }}
        </h2>
        <p class="sub">
          <template v-if="fp.label && fp.label !== title">
            {{ isOp ? `Leader ${fp.label}` : fp.label }} ·
          </template>
          {{ formatShortDate(deck.updatedAt) }}
        </p>
        <p v-if="isOp && bounty" class="bounty">
          <span aria-hidden="true">฿</span> {{ bounty }}
        </p>
        <div v-else-if="!isOp && fp.mana.length" class="dots">
          <ManaSymbol v-for="m in fp.mana" :key="m" :sym="m" :size="18" />
        </div>
        <div v-else-if="fp.dots.length" class="dots">
          <span v-for="(c, i) in fp.dots" :key="i" class="dot" :style="{ background: c }" />
        </div>
      </div>
    </div>

    <div class="foot">
      <span class="count" :class="{ ok: fp.complete }">{{ progress }}</span>
      <span v-if="deck.public" class="source">{{ t('tile.public') }}</span>
    </div>
  </div>
</template>

<style scoped>
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 176px;
  padding: 16px 16px 14px;
  cursor: pointer;
  transition:
    transform 0.35s cubic-bezier(0.3, 1.7, 0.5, 1),
    box-shadow 0.3s ease;
}
.tile:focus-visible {
  outline: 2px solid rgb(var(--accent-rgb, 168, 178, 196));
  outline-offset: 3px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.world {
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.menu {
  opacity: 0;
  transition: opacity 0.2s ease;
}
.tile:hover .menu,
.tile:focus-within .menu {
  opacity: 0.8;
}
.main {
  display: flex;
  flex: 1;
  gap: 12px;
  min-width: 0;
}
.leader {
  flex: 0 0 auto;
  width: 54px;
  align-self: flex-start;
  border: 2px solid #231708;
  border-radius: 3px;
  rotate: -3deg;
  box-shadow: 2px 2px 0 #231708;
}
.name {
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 1.1;
}
.sub {
  margin: 4px 0 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
}
.dots {
  display: flex;
  gap: 5px;
  margin-top: 10px;
}
.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}
.foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
}
.count {
  margin-right: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.source {
  padding: 1px 7px;
  border-radius: 2px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

/* ---- One Piece: a poster pinned askew ---- */
.tile--op {
  rotate: -0.8deg;
  border: 1px solid rgba(58, 38, 22, 0.35);
  border-radius: 2px;
  background:
    linear-gradient(180deg, rgba(201, 49, 42, 0.07), transparent 40%), linear-gradient(180deg, #fbf3e3, #efdfc0);
  box-shadow:
    0 1px 0 rgba(58, 38, 22, 0.1),
    0 12px 22px -14px rgba(58, 38, 22, 0.6);
  color: #231708;
}
.tile--op:nth-child(even) {
  rotate: 0.9deg;
}
.tile--op:hover {
  rotate: 0deg;
  transform: translateY(-4px) scale(1.015);
  box-shadow:
    0 1px 0 rgba(58, 38, 22, 0.1),
    0 22px 36px -18px rgba(58, 38, 22, 0.7);
}
.tile--op .pin {
  position: absolute;
  top: 6px;
  left: 50%;
  width: 12px;
  height: 12px;
  translate: -50% 0;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ef6b5d, #c9312a 55%, #7a1a14);
  box-shadow: 0 2px 3px rgba(35, 23, 8, 0.45);
}
.tile--op .world {
  font-family: 'Anton', Impact, sans-serif;
  color: #a4231d;
}
.tile--op .name {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 22px;
  text-transform: uppercase;
  letter-spacing: 0.01em;
}
.tile--op .sub {
  color: #6b5236;
}
.tile--op .bounty {
  margin: 8px 0 0;
  font-family: 'Anton', Impact, sans-serif;
  font-size: 20px;
  letter-spacing: 0.02em;
}
.tile--op .bounty span {
  color: #a4231d;
}
.tile--op .foot {
  border-top: 1px dashed rgba(58, 38, 22, 0.3);
}
.tile--op .count.ok {
  color: #2f8a4f;
}
.tile--op .source {
  background: #231708;
  color: #fbf4e6;
}

/* ---- Magic: a sleeved deck on the workbench, in daylight ---- */
.tile--mtg {
  border: 1px solid rgba(27, 31, 34, 0.12);
  border-radius: 10px;
  /* The stitched edge of the mat it sits on. */
  outline: 1px dashed rgba(45, 79, 124, 0.16);
  outline-offset: -6px;
  background:
    radial-gradient(420px 180px at 85% -20%, rgba(var(--accent-rgb, 45, 79, 124), 0.08), transparent 60%),
    linear-gradient(180deg, #ffffff, #f2f3f0);
  box-shadow: 0 8px 20px -14px rgba(27, 31, 34, 0.45);
  color: #1b1f22;
  transition:
    transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.26s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.26s ease;
}
.tile--mtg:hover {
  transform: translateY(-3px);
  border-color: rgba(45, 79, 124, 0.45);
  box-shadow: 0 16px 30px -18px rgba(27, 31, 34, 0.5);
}
/* The commander's art: the deck box's window, full width, fading into it. */
.tile--mtg .art {
  position: relative;
  height: 92px;
  margin: -16px -16px -4px;
  overflow: hidden;
  border-radius: 9px 9px 0 0;
}
.tile--mtg .art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 28%;
  transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.tile--mtg .art::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, transparent 45%, #fdfdfc 100%),
    linear-gradient(90deg, rgba(var(--accent-rgb, 45, 79, 124), 0.18), transparent 60%);
}
.tile--mtg:has(.art) {
  outline-color: transparent; /* the stitch would cross the art */
}
.tile--mtg:hover .art img {
  transform: scale(1.04);
}
/* A counter, the kind that tracks life beside the deck. */
.tile--mtg .token {
  position: absolute;
  right: 14px;
  bottom: 12px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: radial-gradient(circle at 36% 30%, #6d90bd, #2d4f7c 62%, #1d3555);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.3),
    inset 0 -2px 3px rgba(0, 0, 0, 0.25),
    0 2px 5px rgba(27, 31, 34, 0.3);
}
.tile--mtg .world {
  font-family: var(--mtg-face);
  font-weight: 600;
  letter-spacing: 0.18em;
  color: #2d4f7c;
}
.tile--mtg .name {
  font-family: var(--mtg-face);
  font-weight: 700;
  font-size: 19px;
  letter-spacing: 0.03em;
}
.tile--mtg .sub {
  font-family: var(--mtg-face);
  font-size: 14px;
  color: #616a6f;
}
.tile--mtg .dot {
  border: 1px solid rgba(27, 31, 34, 0.25);
}
.tile--mtg .foot {
  padding-right: 34px;
  border-top: 1px solid rgba(27, 31, 34, 0.1);
}
.tile--mtg .count {
  color: #454d52;
}
.tile--mtg .count.ok {
  color: #2d4f7c;
}
.tile--mtg .source {
  border: 1px solid rgba(45, 79, 124, 0.3);
  color: #2d4f7c;
}

@media (prefers-reduced-motion: reduce) {
  .tile,
  .tile--op,
  .tile--op:nth-child(even) {
    rotate: 0deg;
    transition: none;
  }
}
</style>
