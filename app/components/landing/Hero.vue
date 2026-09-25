<script setup lang="ts">
import type { LandingCard, LandingPoster } from '#shared/landing'
import { computed } from 'vue'
import { libraryPath } from '#shared/game'
import { tideFromMagic, tideFromPoster } from '~/utils/cardTide'

// Two worlds in one pile of cards: One Piece washes in from the left, Magic
// from the right, and a seam runs between them, leaning away from the
// pointer. The reading panel floats in a calm pocket in the middle; its
// headline changes ink where it crosses the seam. A card clicked (or dealt
// while nobody touches the page) goes on show beside the panel, in its own
// world's corner, with a way to its page.
const props = defineProps<{
  posters: LandingPoster[]
  cards: LandingCard[]
}>()

const { t } = useLocale()

const opCards = computed(() => props.posters.map(tideFromPoster))
const mtgCards = computed(() => props.cards.map(tideFromMagic))
</script>

<template>
  <LandingCardTide :op="opCards" :mtg="mtgCards" class="hero">
    <template #default="{ op, mtg }">
      <div class="stage">
        <div class="panel" data-tide-pocket>
          <div class="kickers">
            <span class="kicker kicker--op">{{ t('home.hero.opKicker') }}</span>
            <span class="kicker kicker--mtg">{{ t('home.hero.mtgKicker') }}</span>
          </div>

          <!-- One headline, two inks: the copy for the day side is decoration. -->
          <h1 class="headline">
            <span class="hl hl--mtg">{{ t('home.hero.l1') }}<br>{{ t('home.hero.l2') }}</span>
            <span class="hl hl--op" aria-hidden="true">{{ t('home.hero.l1') }}<br>{{ t('home.hero.l2') }}</span>
          </h1>
          <p class="sub">
            {{ t('home.hero.sub') }}
          </p>

          <div class="doors">
            <div class="door door--op">
              <NuxtLink :to="libraryPath('optcg')" class="cta cta--op">
                {{ t('home.hero.opCta') }}
                <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
              </NuxtLink>
              <span class="line">{{ t('home.hero.opLine') }}</span>
            </div>
            <div class="door door--mtg">
              <NuxtLink :to="libraryPath('mtg')" class="cta cta--mtg">
                {{ t('home.hero.mtgCta') }}
                <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
              </NuxtLink>
              <span class="line">{{ t('home.hero.mtgLine') }}</span>
            </div>
          </div>

          <p class="hint">
            <UIcon name="i-lucide-hand" class="h-3.5 w-3.5 shrink-0" />
            <span class="hint-pointer">{{ t('home.hero.hint') }}</span>
            <span class="hint-touch">{{ t('home.hero.hintTouch') }}</span>
          </p>
        </div>

        <Transition name="caption">
          <div v-if="op" :key="op.path" class="caption caption--op" :style="{ '--glow': op.accent }">
            <span class="caption-pips">
              <i v-for="(pip, k) in op.pips" :key="k" :style="{ background: pip }" />
            </span>
            <strong class="caption-name">{{ op.name }}</strong>
            <span class="caption-detail">{{ op.detail }}</span>
            <NuxtLink :to="op.path" class="caption-link">
              {{ t('home.hero.seeCard') }}
              <UIcon name="i-lucide-arrow-up-right" class="h-3.5 w-3.5" />
            </NuxtLink>
          </div>
        </Transition>
        <Transition name="caption">
          <div v-if="mtg" :key="mtg.path" class="caption caption--mtg" :style="{ '--glow': mtg.accent }">
            <span class="caption-pips">
              <i v-for="(pip, k) in mtg.pips" :key="k" :style="{ background: pip }" />
            </span>
            <strong class="caption-name">{{ mtg.name }}</strong>
            <span v-if="mtg.detail" class="caption-detail">{{ t('home.hero.artist') }} · {{ mtg.detail }}</span>
            <NuxtLink :to="mtg.path" class="caption-link">
              {{ t('home.hero.seeCard') }}
              <UIcon name="i-lucide-arrow-up-right" class="h-3.5 w-3.5" />
            </NuxtLink>
          </div>
        </Transition>

        <a href="#numbers" class="scroll">
          <span>{{ t('home.hero.scroll') }}</span>
          <UIcon name="i-lucide-chevron-down" class="h-4 w-4" />
        </a>
      </div>
    </template>
  </LandingCardTide>
</template>

<style scoped>
.hero {
  /* One screen under the site's top bar. */
  min-height: max(640px, min(calc(100svh - 64px), 940px));
  color: #1b1f22;
}
.stage {
  position: relative;
  display: grid;
  place-items: center;
  padding: 48px clamp(16px, 4vw, 48px) 72px;
}

/* ---- the reading panel: warm glass on the day side, cool on the night side ---- */
.panel {
  --pad: clamp(20px, 3.4vw, 46px);
  /* Where the seam crosses the panel, in the panel's own width. */
  --psplit: calc(50% - var(--tide-px) * var(--tide-ratio) * 6%);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  width: min(760px, 100%);
  padding: clamp(24px, 3.2vw, 40px) var(--pad);
  border: 1px solid transparent;
  border-radius: 22px;
  background:
    linear-gradient(90deg, rgba(246, 234, 208, 0.95) var(--psplit), rgba(238, 240, 238, 0.95) var(--psplit)) padding-box,
    linear-gradient(90deg, rgba(201, 49, 42, 0.55), rgba(120, 128, 132, 0.3) 50%, rgba(45, 79, 124, 0.55)) border-box;
  box-shadow:
    0 40px 90px -34px rgba(0, 0, 0, 0.8),
    inset 0 1px 0 rgba(255, 255, 255, 0.75);
  -webkit-backdrop-filter: blur(14px) saturate(1.05);
  backdrop-filter: blur(14px) saturate(1.05);
  pointer-events: auto;
}

.kickers {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px 16px;
  width: 100%;
}
.kicker {
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.kicker--op {
  font-family: 'Bangers', 'Anton', Impact, sans-serif;
  font-size: 16px;
  letter-spacing: 0.1em;
  color: #a4231d;
}
.kicker--mtg {
  font-family: var(--mtg-face);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.22em;
  color: #2d4f7c;
}

.headline {
  display: grid;
  width: calc(100% + var(--pad) * 2);
  margin: 0 calc(var(--pad) * -1);
  font-size: clamp(46px, 6.6vw, 104px);
  font-weight: 400;
  line-height: 0.92;
  text-align: center;
}
.hl {
  grid-area: 1 / 1;
  padding-inline: var(--pad);
  font-family: 'Anton', Impact, sans-serif;
  letter-spacing: 0.01em;
  text-transform: uppercase;
}
.hl--op {
  clip-path: inset(-20% calc(100% - var(--psplit)) -20% 0);
  color: #231708;
  text-shadow: 0.045em 0.045em 0 #c9312a;
}
.hl--mtg {
  clip-path: inset(-20% 0 -20% var(--psplit));
  background: linear-gradient(180deg, #4a75aa 0%, #2d4f7c 45%, #1d3555 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.sub {
  max-width: 54ch;
  margin: 0;
  color: #333a3d;
  font-size: clamp(15px, 1.25vw, 17px);
  line-height: 1.55;
  text-align: center;
  text-wrap: balance;
}

/* ---- the two doors ---- */
.doors {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 28px;
  width: 100%;
  margin-top: 4px;
}
.door {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.door--op {
  align-items: flex-start;
}
.door--mtg {
  align-items: flex-end;
  text-align: right;
}
.line {
  font-size: 13px;
  line-height: 1.4;
}
.door--op .line {
  color: #5e472c;
}
.door--mtg .line {
  font-family: var(--mtg-face);
  font-size: 15px;
  color: #454d52;
}
.cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 13px 22px;
  font-size: 15px;
  text-decoration: none;
  white-space: nowrap;
}
.cta--op {
  border: 2px solid #1a0f06;
  border-radius: 3px;
  background: #c9312a;
  color: #fff8ec;
  font-family: 'Anton', Impact, sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  box-shadow: 5px 5px 0 #231708;
  transition:
    transform 0.3s cubic-bezier(0.3, 1.7, 0.5, 1),
    box-shadow 0.3s ease;
}
.cta--op:hover {
  transform: translate(-2px, -2px) rotate(-2deg);
  box-shadow: 8px 8px 0 #231708;
}
.cta--mtg {
  border: 1px solid #24405f;
  border-radius: 6px;
  background: linear-gradient(180deg, #37608f, #2d4f7c);
  color: #f4f7fb;
  font-family: var(--mtg-face);
  font-weight: 600;
  letter-spacing: 0.04em;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.25) inset,
    0 10px 24px -14px rgba(0, 0, 0, 0.9);
  transition:
    transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.1),
    box-shadow 0.2s ease;
}
.cta--mtg:hover {
  transform: translateY(-2px);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.4) inset,
    0 16px 28px -16px rgba(0, 0, 0, 0.95);
}
.cta:focus-visible {
  outline: 2px solid #1b1f22;
  outline-offset: 4px;
}
/* These sit over the card pile, where a dark ring would disappear. */
.caption-link:focus-visible,
.scroll:focus-visible {
  outline: 2px solid #f4f1e6;
  outline-offset: 4px;
}

.hint {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 0;
  color: rgba(27, 31, 34, 0.6);
  font-size: 12.5px;
  text-align: center;
}
.hint-touch {
  display: none;
}
@media (hover: none) {
  .hint-pointer {
    display: none;
  }
  .hint-touch {
    display: inline;
  }
}

/* ---- the card on show, named in its world's corner ---- */
.caption {
  /* Over the pile, not on the panel: this plate keeps its own light ink. */
  color: #eef2f7;
  --glow: 45, 79, 124;
  /* The card's colour, lifted toward the text so a black card stays readable. */
  --ink: color-mix(in srgb, rgb(var(--glow)) 35%, #eef2f7);
  position: absolute;
  bottom: clamp(20px, 4.5vh, 44px);
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 2px 10px;
  max-width: min(300px, 24vw);
  padding: 10px 16px 12px;
  border: 1px solid color-mix(in srgb, var(--ink) 40%, transparent);
  border-radius: 12px;
  background: rgba(12, 10, 16, 0.72);
  box-shadow: 0 10px 30px -12px rgba(0, 0, 0, 0.85);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  pointer-events: auto;
}
.caption--op {
  left: clamp(16px, 3vw, 48px);
}
.caption--mtg {
  right: clamp(16px, 3vw, 48px);
}
.caption-pips {
  display: inline-flex;
  gap: 4px;
}
.caption-pips i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.5),
    0 0 6px rgba(0, 0, 0, 0.6);
}
.caption-name {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.caption-detail {
  grid-column: 1 / -1;
  overflow: hidden;
  color: rgba(238, 242, 247, 0.68);
  font-family: 'Geist Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.caption-link {
  grid-column: 1 / -1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  margin-top: 4px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
}
.caption-link:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.caption-enter-active,
.caption-leave-active {
  transition:
    opacity 0.35s ease,
    translate 0.35s ease;
}
.caption-enter-from {
  opacity: 0;
  translate: 0 8px;
}
.caption-leave-to {
  opacity: 0;
  translate: 0 -8px;
}

.scroll {
  position: absolute;
  bottom: 18px;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  translate: -50% 0;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(16, 13, 20, 0.7);
  color: #efe6d0;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-decoration: none;
  pointer-events: auto;
  animation: nudge 2.4s ease-in-out infinite;
}
@keyframes nudge {
  50% {
    translate: -50% 4px;
  }
}

/* ---- narrow screens: the panel sits low, cards go on show above it ---- */
@media (max-width: 1100px) {
  .caption {
    max-width: 30vw;
  }
}
@media (max-width: 720px) {
  .hero {
    min-height: max(660px, 100svh);
  }
  .stage {
    align-items: end;
    padding: 96px 16px 40px;
  }
  .panel {
    gap: 16px;
  }
  .doors {
    grid-template-columns: 1fr;
  }
  .door--mtg {
    align-items: flex-start;
    text-align: left;
  }
  .caption,
  .scroll {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scroll {
    animation: none;
  }
  .cta,
  .caption-enter-active,
  .caption-leave-active {
    transition: none;
  }
}
</style>
