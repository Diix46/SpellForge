<script setup lang="ts">
import type { DeckFingerprint } from '~/composables/useDeckFingerprints'
import type { Deck } from '~/composables/useDeckStore'
import { computed } from 'vue'
import { isDefaultDeckName } from '#shared/decks'

// A deck on the dashboard, dressed as its world whatever the page's mode: a
// One Piece deck is the Leader's WANTED poster, as the Marines print them
// (portrait, DEAD OR ALIVE, name, bounty); a Magic deck is a sleeved deck on
// the mat, under its commander's art. Same grid, same actions.
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
// How far the deck is from its full size, as a gauge along the foot.
const filled = computed(() => `${Math.min(100, Math.round((fp.value.count / fp.value.target) * 100))}%`)
// The gauge in every colour of the deck (the accent pair would drop the middle one).
const gaugeFill = computed(() => {
  const c = fp.value.dots
  if (c.length > 1)
    return `linear-gradient(90deg, ${c.join(', ')})`
  return c[0] ?? undefined
})
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
    <!-- Magic: the commander's art across the top of the deck box. -->
    <div v-if="!isOp && fp.art" class="art" aria-hidden="true">
      <img :src="fp.art" alt="" loading="lazy">
    </div>

    <div class="head">
      <span v-if="isOp" class="wanted-title">{{ t('optcg.wanted') }}</span>
      <span v-else class="world">Magic</span>
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

    <!-- One Piece: the poster's portrait, then DEAD OR ALIVE. -->
    <template v-if="isOp">
      <div class="portrait" aria-hidden="true">
        <img v-if="fp.art" :src="fp.art" alt="" loading="lazy" decoding="async">
        <UIcon v-else name="i-lucide-skull" class="h-10 w-10" />
      </div>
      <p class="doa" aria-hidden="true">
        Dead or alive
      </p>
    </template>

    <div class="main">
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
          <span aria-hidden="true">฿</span>{{ bounty }}<span aria-hidden="true">-</span>
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
      <span class="count" :class="{ ok: fp.complete }">
        <UIcon v-if="fp.complete" name="i-lucide-check" class="h-3.5 w-3.5" />{{ progress }}
      </span>
      <span class="gauge" aria-hidden="true"><span :style="{ width: filled, background: gaugeFill }" /></span>
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
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
/* The deck's fill, from empty to its full size. */
.gauge {
  flex: 1;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
}
.gauge span {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
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
.tile--op .name {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 26px;
  text-transform: uppercase;
  letter-spacing: 0.01em;
}
.tile--op .sub {
  color: #6b5236;
}
.tile--op .bounty {
  margin: 2px 0 0;
  font-family: 'Anton', Impact, sans-serif;
  font-size: 26px;
  letter-spacing: 0.02em;
}
.tile--op .bounty span {
  color: #a4231d;
}
.tile--op .foot {
  border-top: 1px dashed rgba(58, 38, 22, 0.3);
}
.tile--op .gauge {
  background: rgba(58, 38, 22, 0.12);
}
/* A fuse, in the Leader's colours. */
.tile--op .gauge span {
  background: linear-gradient(
    90deg,
    rgb(var(--accent-rgb, 201, 49, 42)),
    rgb(var(--accent-rgb-2, var(--accent-rgb, 201, 49, 42)))
  );
}
.tile--op .count.ok {
  color: #2f8a4f;
}
.tile--op .source {
  background: #231708;
  color: #fbf4e6;
}

/* The poster, as the Marines print it: WANTED across the top, the portrait
   filling the sheet, DEAD OR ALIVE, the name and the bounty, centred. */
.tile--op {
  text-align: center;
}
.tile--op .head {
  position: relative;
  justify-content: center;
  margin-top: 6px;
}
.tile--op .head .menu {
  position: absolute;
  right: -6px;
  top: -4px;
}
.tile--op .wanted-title {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 40px;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #3a2616;
  text-shadow: 1px 1px 0 rgba(251, 243, 227, 0.8);
}
.tile--op .portrait {
  display: grid;
  place-items: center;
  height: 150px;
  margin: 0 2px;
  overflow: hidden;
  border: 3px solid #3a2616;
  background: #e8d5b0;
  color: rgba(58, 38, 22, 0.35);
  box-shadow: inset 0 0 0 2px rgba(251, 243, 227, 0.6);
}
.tile--op .portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 21%;
  /* Closer on the character: not the card's power above, nor its footer. */
  transform: scale(1.34);
  transform-origin: 50% 34%;
  /* Printed on the poster's paper: a touch of sepia. */
  filter: sepia(0.22) saturate(1.05) contrast(1.04);
  transition: transform 0.45s cubic-bezier(0.3, 1.7, 0.5, 1);
}
.tile--op:hover .portrait img {
  transform: scale(1.4);
}
.tile--op .doa {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -4px 0 -6px;
  font-family: 'Anton', Impact, sans-serif;
  font-size: 15px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #3a2616;
}
.tile--op .doa::before,
.tile--op .doa::after {
  content: '';
  flex: 1;
  height: 2px;
  background: #3a2616;
}
.tile--op .main {
  justify-content: center;
}
/* Name, bounty, then the small print. */
.tile--op .main > div {
  display: flex;
  flex-direction: column;
}
.tile--op .name {
  order: 1;
}
.tile--op .bounty {
  order: 2;
}
.tile--op .sub {
  order: 3;
  margin-top: 6px;
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
  height: 136px;
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
  border-top: 1px solid rgba(27, 31, 34, 0.1);
}
.tile--mtg .count {
  color: #454d52;
}
.tile--mtg .count.ok {
  color: #2d4f7c;
}
.tile--mtg .gauge {
  background: rgba(27, 31, 34, 0.08);
}
/* In the commander's colours. */
.tile--mtg .gauge span {
  background: linear-gradient(
    90deg,
    rgb(var(--accent-rgb, 45, 79, 124)),
    rgb(var(--accent-rgb-2, var(--accent-rgb, 45, 79, 124)))
  );
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

<style>
/* Magic after dark: the same deck box on the night table (the One Piece
   poster keeps its paper, pinned on the dark deck). */
html.dark .tile--mtg {
  border-color: rgba(238, 240, 241, 0.09);
  outline-color: rgba(122, 160, 212, 0.18);
  background:
    radial-gradient(420px 180px at 85% -20%, rgba(var(--accent-rgb, 122, 160, 212), 0.12), transparent 60%),
    linear-gradient(180deg, #1b1f23, #15181b);
  box-shadow: 0 10px 24px -16px rgba(0, 0, 0, 0.8);
  color: #eef0f1;
}
html.dark .tile--mtg:hover {
  border-color: rgba(122, 160, 212, 0.45);
  box-shadow: 0 18px 34px -18px rgba(0, 0, 0, 0.85);
}
html.dark .tile--mtg .art::after {
  background:
    linear-gradient(180deg, transparent 40%, #1b1f23 100%),
    linear-gradient(90deg, rgba(var(--accent-rgb, 122, 160, 212), 0.2), transparent 60%);
}
html.dark .tile--mtg:has(.art) {
  outline-color: transparent;
}
html.dark .tile--mtg .world,
html.dark .tile--mtg .count.ok {
  color: #a8c3e8;
}
html.dark .tile--mtg .sub {
  color: #959da1;
}
html.dark .tile--mtg .count {
  color: #c4cacd;
}
html.dark .tile--mtg .foot {
  border-top-color: rgba(238, 240, 241, 0.1);
}
html.dark .tile--mtg .gauge {
  background: rgba(238, 240, 241, 0.1);
}
html.dark .tile--mtg .source {
  border-color: rgba(122, 160, 212, 0.35);
  color: #a8c3e8;
}
</style>
