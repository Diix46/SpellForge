<script setup lang="ts">
import type { LandingCard } from '~~/server/api/landing/cards.get'
import type { OptcgCard } from '#shared/optcg/types'
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { libraryPath } from '#shared/game'

// Two worlds laid over each other and cut by one seam. Day on the left: paper,
// sea, a ship and pinned posters. Night on the right: obsidian, a turning
// circle, embers and floating cards. The seam leans toward the pointer, so the
// world you look at gets a little more room; the headline crosses it and
// changes its ink on the way.
const props = defineProps<{
  posters: OptcgCard[]
  cards: LandingCard[]
}>()

const { t } = useLocale()

const root = useTemplateRef<HTMLElement>('root')
const leftPosters = computed(() => props.posters.slice(0, 3))
const rightCards = computed(() => props.cards.slice(0, 3))

// Pointer tracking writes CSS variables directly: no re-render per frame.
let raf = 0
let target = { split: 50, px: 0, py: 0 }
const current = { split: 50, px: 0, py: 0 }
function frame() {
  const el = root.value
  if (!el)
    return
  const ease = 0.08
  current.split += (target.split - current.split) * ease
  current.px += (target.px - current.px) * ease
  current.py += (target.py - current.py) * ease
  el.style.setProperty('--split', `${current.split.toFixed(2)}%`)
  el.style.setProperty('--px', current.px.toFixed(3))
  el.style.setProperty('--py', current.py.toFixed(3))
  const settled = Math.abs(target.split - current.split) < 0.01 && Math.abs(target.px - current.px) < 0.001
  raf = settled ? 0 : requestAnimationFrame(frame)
}
function kick() {
  if (!raf)
    raf = requestAnimationFrame(frame)
}
function onMove(e: PointerEvent) {
  if (e.pointerType !== 'mouse' || !root.value)
    return
  const r = root.value.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width
  const y = (e.clientY - r.top) / r.height
  target = { split: 50 + (0.5 - x) * 16, px: x * 2 - 1, py: y * 2 - 1 }
  kick()
}
function onLeave() {
  target = { split: 50, px: 0, py: 0 }
  kick()
}

let reduced = false
onMounted(() => {
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
})
function move(e: PointerEvent) {
  if (!reduced)
    onMove(e)
}
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <section ref="root" class="hero" @pointermove="move" @pointerleave="onLeave">
    <!-- Day -->
    <div class="world world--op">
      <FxOnePieceSea class="fx" />
      <div class="sun" aria-hidden="true" />
      <div class="posters" aria-hidden="true">
        <span v-for="(c, i) in leftPosters" :key="c.id" class="poster" :style="{ '--i': i }">
          <span class="pin" />
          <img :src="c.thumb" alt="" width="600" height="838" fetchpriority="high">
        </span>
      </div>
      <div class="side side--op">
        <p class="kicker">
          {{ t('home.hero.opKicker') }}
        </p>
        <p class="line">
          {{ t('home.hero.opLine') }}
        </p>
        <NuxtLink :to="libraryPath('optcg')" class="cta cta--op">
          {{ t('home.hero.opCta') }}
          <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
        </NuxtLink>
      </div>
    </div>

    <!-- Night -->
    <div class="world world--mtg">
      <FxMagicSanctum class="fx" />
      <div class="cards" aria-hidden="true">
        <span v-for="(c, i) in rightCards" :key="c.image" class="card" :style="{ '--i': i }">
          <img :src="c.image" alt="" width="488" height="680" fetchpriority="high">
        </span>
      </div>
      <div class="side side--mtg">
        <p class="kicker">
          {{ t('home.hero.mtgKicker') }}
        </p>
        <p class="line">
          {{ t('home.hero.mtgLine') }}
        </p>
        <NuxtLink :to="libraryPath('mtg')" class="cta cta--mtg">
          {{ t('home.hero.mtgCta') }}
          <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
        </NuxtLink>
      </div>
    </div>

    <!-- The seam -->
    <div class="seam" aria-hidden="true">
      <span class="seam-line" />
    </div>

    <!-- One headline, two inks -->
    <div class="center">
      <h1 class="headline">
        <span class="hl hl--mtg">{{ t('home.hero.l1') }}<br>{{ t('home.hero.l2') }}</span>
        <span class="hl hl--op" aria-hidden="true">{{ t('home.hero.l1') }}<br>{{ t('home.hero.l2') }}</span>
      </h1>
      <p class="sub">
        {{ t('home.hero.sub') }}
      </p>
    </div>

    <a href="#numbers" class="scroll">
      <span>{{ t('home.hero.scroll') }}</span>
      <UIcon name="i-lucide-chevron-down" class="h-4 w-4" />
    </a>
  </section>
</template>

<style scoped>
.hero {
  --split: 50%;
  --px: 0;
  --py: 0;
  position: relative;
  height: max(680px, min(100svh, 1000px));
  overflow: hidden;
  background: #07060b;
  isolation: isolate;
}
.world {
  position: absolute;
  inset: 0;
}
.world--op {
  z-index: 1;
  clip-path: inset(0 calc(100% - var(--split)) 0 0);
  background:
    radial-gradient(900px 520px at 18% 8%, rgba(233, 167, 44, 0.3), transparent 60%),
    linear-gradient(180deg, #f6ead0 0%, #efdfc0 55%, #e6d2aa 100%);
  color: #231708;
  --u-sea: #1d6f92;
}
.world--mtg {
  z-index: 1;
  clip-path: inset(0 0 0 var(--split));
  background:
    radial-gradient(800px 520px at 82% 92%, rgba(138, 106, 212, 0.22), transparent 60%),
    radial-gradient(700px 420px at 70% 10%, rgba(212, 175, 95, 0.1), transparent 60%),
    linear-gradient(180deg, #0c0a12, #07060b);
  color: #f3ecda;
  --accent-rgb: 212, 175, 95;
}
.fx {
  position: absolute !important;
  z-index: 0 !important;
}
.sun {
  position: absolute;
  top: 9%;
  left: 12%;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background: radial-gradient(circle, #ffd27a 0%, #f2b64a 45%, rgba(242, 182, 74, 0) 70%);
  opacity: 0.55;
  translate: calc(var(--px) * -10px) calc(var(--py) * -6px);
}

/* ---- floating art ---- */
.posters,
.cards {
  position: absolute;
  z-index: 1;
  top: 16%;
  width: 260px;
  height: 420px;
  pointer-events: none;
}
.posters {
  left: clamp(8px, 3vw, 56px);
  translate: calc(var(--px) * -14px) calc(var(--py) * -10px);
}
.cards {
  right: clamp(8px, 3vw, 56px);
  translate: calc(var(--px) * -14px) calc(var(--py) * -10px);
}
.poster {
  position: absolute;
  top: calc(var(--i) * 118px);
  left: calc(var(--i) * 34px - (var(--i) * var(--i) * 12px));
  width: 142px;
  padding: 14px 6px 6px;
  border: 1px solid rgba(58, 38, 22, 0.35);
  background: #fbf3e3;
  box-shadow: 0 18px 30px -18px rgba(58, 38, 22, 0.75);
  rotate: calc(-7deg + var(--i) * 6deg);
  animation: sway 7s ease-in-out infinite alternate;
  animation-delay: calc(var(--i) * -2.3s);
}
.poster img {
  display: block;
  width: 100%;
  height: auto;
  border: 2px solid #3a2616;
}
.pin {
  position: absolute;
  top: 3px;
  left: 50%;
  width: 10px;
  height: 10px;
  translate: -50% 0;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ef6b5d, #c9312a 55%, #7a1a14);
}
.card {
  position: absolute;
  top: calc(var(--i) * 104px);
  right: calc(var(--i) * 30px - (var(--i) * var(--i) * 10px));
  width: 150px;
  border-radius: 7px;
  box-shadow:
    0 0 0 1px rgba(212, 175, 95, 0.4),
    0 24px 44px -20px rgba(0, 0, 0, 0.9),
    0 0 40px -12px rgba(212, 175, 95, 0.45);
  rotate: calc(6deg - var(--i) * 5deg);
  animation: float 9s ease-in-out infinite alternate;
  animation-delay: calc(var(--i) * -3s);
}
.card img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 7px;
}
@keyframes sway {
  to {
    rotate: calc(-4deg + var(--i) * 4deg);
    translate: 0 6px;
  }
}
@keyframes float {
  to {
    translate: 0 -12px;
    rotate: calc(3deg - var(--i) * 4deg);
  }
}

/* ---- world sides (kicker, line, call to action) ---- */
.side {
  position: absolute;
  z-index: 2;
  bottom: clamp(56px, 9vh, 96px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 30vw;
}
.side--op {
  left: clamp(20px, 5vw, 80px);
  align-items: flex-start;
}
.side--mtg {
  right: clamp(20px, 5vw, 80px);
  align-items: flex-end;
  text-align: right;
}
.kicker {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}
.side--op .kicker {
  font-family: 'Bangers', 'Anton', Impact, sans-serif;
  font-size: 15px;
  letter-spacing: 0.12em;
  color: #a4231d;
}
.side--mtg .kicker {
  font-family: 'Cinzel', ui-serif, Georgia, serif;
  font-weight: 700;
  color: #d4af5f;
}
.line {
  margin: 0;
  font-size: 16px;
  line-height: 1.45;
}
.side--op .line {
  color: #45321d;
}
.side--mtg .line {
  font-family: 'EB Garamond', ui-serif, Georgia, serif;
  font-style: italic;
  font-size: 19px;
  color: #d6cbb1;
}
.cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  padding: 13px 24px;
  font-size: 15px;
  text-decoration: none;
}
.cta--op {
  border: 2px solid #231708;
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
  border: 1px solid #d4af5f;
  border-radius: 3px;
  background: linear-gradient(180deg, #e6c97f, #c9a24e);
  color: #100c06;
  font-family: 'Cinzel', ui-serif, Georgia, serif;
  font-weight: 700;
  letter-spacing: 0.08em;
  box-shadow: 0 0 26px -6px rgba(212, 175, 95, 0.7);
  transition: box-shadow 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}
.cta--mtg:hover {
  box-shadow: 0 0 46px -2px rgba(212, 175, 95, 0.95);
}
.cta:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 4px;
}

/* ---- seam ---- */
.seam {
  position: absolute;
  z-index: 3;
  inset: 0 auto 0 var(--split);
  width: 0;
  pointer-events: none;
}
.seam-line {
  position: absolute;
  inset: 0 auto 0 -1px;
  width: 2px;
  background: linear-gradient(180deg, transparent 0%, #c9312a 22%, #f1d994 52%, #d4af5f 78%, transparent 100%);
  box-shadow: 0 0 18px rgba(241, 217, 148, 0.55);
}

/* ---- headline ---- */
.center {
  position: absolute;
  z-index: 4;
  inset: 16% 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 26px;
  pointer-events: none;
}
.headline {
  display: grid;
  width: 100%;
  margin: 0;
  font-size: clamp(56px, 9.4vw, 156px);
  font-weight: 400;
  line-height: 0.9;
  text-align: center;
}
.hl {
  grid-area: 1 / 1;
  font-family: 'Anton', Impact, sans-serif;
  letter-spacing: 0.01em;
  text-transform: uppercase;
}
.hl--op {
  clip-path: inset(-20% calc(100% - var(--split)) -20% 0);
  color: #231708;
  text-shadow: 0.045em 0.045em 0 #c9312a;
}
.hl--mtg {
  clip-path: inset(-20% 0 -20% var(--split));
  background: linear-gradient(180deg, #fff3cf 0%, #e6c97f 45%, #b8903f 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 24px rgba(212, 175, 95, 0.35));
}
.sub {
  max-width: min(600px, 86vw);
  margin: 0;
  padding: 14px 22px;
  border: 1px solid transparent;
  border-radius: 8px;
  background:
    linear-gradient(rgba(16, 13, 20, 0.9), rgba(16, 13, 20, 0.9)) padding-box,
    linear-gradient(90deg, #c9312a, #d4af5f) border-box;
  box-shadow: 0 20px 44px -22px rgba(0, 0, 0, 0.8);
  color: #efe6d0;
  font-size: clamp(15px, 1.25vw, 17px);
  line-height: 1.55;
  text-align: center;
  text-wrap: balance;
  pointer-events: auto;
}

.scroll {
  position: absolute;
  z-index: 4;
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
  animation: nudge 2.4s ease-in-out infinite;
}
@keyframes nudge {
  50% {
    translate: -50% 4px;
  }
}

/* ---- narrow screens: the worlds stack, the headline keeps its seam ---- */
@media (max-width: 900px) {
  .hero {
    display: flex;
    flex-direction: column;
    height: auto;
    background: linear-gradient(90deg, #efdfc0 50%, #07060b 50%);
  }
  .world {
    position: relative;
    inset: auto;
    clip-path: none;
    min-height: 330px;
    overflow: hidden;
  }
  .world--op {
    order: 2;
  }
  .world--mtg {
    order: 3;
  }
  .center {
    position: relative;
    inset: auto;
    order: 1;
    padding: 96px 16px 36px;
    gap: 18px;
  }
  .hl--op {
    clip-path: inset(-20% 50% -20% 0);
  }
  .hl--mtg {
    clip-path: inset(-20% 0 -20% 50%);
  }
  .seam {
    display: none;
  }
  .side {
    position: relative;
    inset: auto;
    max-width: none;
    padding: 36px 20px 40px;
  }
  .side--op {
    margin-right: 42%;
  }
  .side--mtg {
    margin-left: 42%;
  }
  .posters,
  .cards {
    top: 28px;
    width: 40%;
    height: 280px;
    translate: none;
  }
  .posters {
    right: 12px;
    left: auto;
  }
  .cards {
    right: auto;
    left: 12px;
  }
  .poster,
  .card {
    width: 92px;
  }
  .poster {
    top: calc(var(--i) * 70px);
  }
  .card {
    top: calc(var(--i) * 64px);
  }
  .sun {
    display: none;
  }
  .scroll {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .poster,
  .card,
  .scroll {
    animation: none;
  }
  .cta {
    transition: none;
  }
}
</style>
