<script setup lang="ts">
import type { LandingCard } from '~~/server/api/landing/cards.get'
import type { OptcgCard } from '#shared/optcg/types'
import { computed } from 'vue'
import { libraryPath } from '#shared/game'
import { OPTCG_COLOR_HEX } from '~/utils/optcgColors'

// The two workshops side by side, each in its own light. One Piece shows its
// rules being checked on a live-looking deck panel; Magic shows a card fan, a
// printed sheet and the coach. Real card art from the landing pools.
const props = defineProps<{
  posters: OptcgCard[]
  cards: LandingCard[]
}>()

const { t, locale } = useLocale()

const leader = computed(() => props.posters.find(c => c.category === 'Leader') ?? props.posters[0] ?? null)
const bounty = computed(() => leader.value?.power?.toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US') ?? null)
const RULES = ['r1', 'r2', 'r3', 'r4', 'r5'] as const
// A plausible fifty-card curve, costs 0 to 10.
const CURVE = [0, 6, 9, 10, 8, 7, 5, 3, 2, 0, 0]
const curveMax = Math.max(...CURVE)

const fan = computed(() => props.cards.slice(3, 8))
const sheet = computed(() => props.cards.slice(8, 17))
const coach = computed(() => props.cards.slice(17, 19))
const FEATURES = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const
</script>

<template>
  <section class="worlds">
    <!-- One Piece -->
    <article class="world world--op">
      <p class="kicker">
        {{ t('home.op.kicker') }}
      </p>
      <h2 class="title">
        {{ t('home.op.title') }}
      </h2>
      <p class="body">
        {{ t('home.op.body') }}
      </p>

      <div class="panel" aria-hidden="true">
        <div class="panel-leader">
          <img v-if="leader" :src="leader.thumb" alt="" width="600" height="838" loading="lazy">
          <div class="panel-leader-info">
            <span class="panel-kicker">Leader</span>
            <strong>{{ leader?.name ?? 'Monkey.D.Luffy' }}</strong>
            <span class="panel-colors">
              <i v-for="c in leader?.colors ?? []" :key="c" :style="{ background: OPTCG_COLOR_HEX[c] }" />
            </span>
            <span v-if="bounty" class="panel-bounty">฿ {{ bounty }}</span>
          </div>
        </div>
        <div class="panel-count">
          <strong>50 / 50</strong>
          <span class="panel-legal"><UIcon name="i-lucide-badge-check" class="h-4 w-4" /> {{ t('home.op.legal') }}</span>
          <span class="panel-don">DON!! ×10</span>
        </div>
        <div class="panel-curve">
          <span class="panel-kicker">{{ t('home.op.curve') }}</span>
          <div class="bars">
            <span v-for="(n, cost) in CURVE" :key="cost" class="bar" :style="{ '--h': `${(n / curveMax) * 100}%`, '--i': cost }">
              <em>{{ cost === 10 ? '10+' : cost }}</em>
            </span>
          </div>
        </div>
      </div>

      <ul class="rules">
        <li v-for="(r, i) in RULES" :key="r" :style="{ '--i': i }">
          <span class="check"><UIcon name="i-lucide-check" class="h-3.5 w-3.5" /></span>
          {{ t(`home.op.${r}`) }}
        </li>
      </ul>
      <p class="note">
        <UIcon name="i-lucide-printer-check" class="h-4 w-4" />
        {{ t('home.op.noPrint') }}
      </p>
      <NuxtLink :to="libraryPath('optcg')" class="cta cta--op">
        {{ t('home.op.cta') }}
        <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
      </NuxtLink>
    </article>

    <!-- Magic -->
    <article class="world world--mtg">
      <p class="kicker">
        {{ t('home.mtg.kicker') }}
      </p>
      <h2 class="title">
        {{ t('home.mtg.title') }}
      </h2>
      <p class="body">
        {{ t('home.mtg.body') }}
      </p>

      <div class="stage" aria-hidden="true">
        <div class="fan">
          <span v-for="(c, i) in fan" :key="c.image" class="fan-card" :style="{ '--i': i, '--n': fan.length }">
            <img :src="c.image" alt="" width="488" height="680" loading="lazy">
          </span>
        </div>
        <div class="sheet">
          <span v-for="(c, i) in sheet" :key="c.image" class="sheet-card" :style="{ '--i': i }">
            <img :src="c.image" alt="" loading="lazy">
          </span>
          <i class="cut cut--v1" /><i class="cut cut--v2" /><i class="cut cut--h1" /><i class="cut cut--h2" />
          <span class="sheet-tag">{{ t('home.mtg.sheet') }}</span>
        </div>
        <div class="coach">
          <span class="coach-head"><UIcon name="i-lucide-sparkles" class="h-3.5 w-3.5" /> Coach</span>
          <p>{{ t('home.mtg.coach') }}</p>
          <span v-for="c in coach" :key="c.image" class="coach-card">
            <img :src="c.art" alt="" loading="lazy">
            <b>{{ c.name }}</b>
            <UIcon name="i-lucide-plus" class="h-3.5 w-3.5" />
          </span>
        </div>
      </div>

      <ul class="features">
        <li v-for="f in FEATURES" :key="f">
          {{ t(`home.mtg.${f}`) }}
        </li>
      </ul>
      <NuxtLink :to="libraryPath('mtg')" class="cta cta--mtg">
        {{ t('home.mtg.cta') }}
        <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
      </NuxtLink>
    </article>
  </section>
</template>

<style scoped>
.worlds {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.world {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  padding: 110px clamp(20px, 5vw, 88px) 120px;
}
.kicker {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}
.title {
  margin: 0;
  line-height: 1;
  text-wrap: balance;
}
.body {
  max-width: 46ch;
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
}
.cta {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 10px;
  margin-top: 8px;
  padding: 13px 22px;
  font-size: 14px;
  text-decoration: none;
}
.cta:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 4px;
}

/* ---- One Piece ---- */
.world--op {
  background:
    radial-gradient(700px 400px at 0% 0%, rgba(201, 49, 42, 0.08), transparent 60%),
    linear-gradient(180deg, #f3e6c9, #ecdcb9);
  color: #231708;
}
.world--op .kicker {
  font-family: 'Bangers', 'Anton', Impact, sans-serif;
  font-size: 16px;
  letter-spacing: 0.1em;
  color: #a4231d;
}
.world--op .title {
  font-family: 'Anton', Impact, sans-serif;
  font-size: clamp(38px, 4.4vw, 68px);
  font-weight: 400;
  text-transform: uppercase;
}
.world--op .body {
  color: #45321d;
}
.panel {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14px;
  max-width: 560px;
  padding: 18px;
  border: 1px solid rgba(58, 38, 22, 0.3);
  border-radius: 3px;
  background: #fbf3e3;
  box-shadow:
    0 1px 0 rgba(58, 38, 22, 0.1),
    0 26px 40px -26px rgba(58, 38, 22, 0.7);
  rotate: -0.6deg;
}
.panel-leader {
  display: flex;
  gap: 14px;
  min-width: 0;
}
.panel-leader img {
  flex: 0 0 auto;
  width: 88px;
  height: auto;
  border: 2px solid #231708;
  border-radius: 3px;
  rotate: -3deg;
  box-shadow: 3px 3px 0 #231708;
}
.panel-leader-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.panel-kicker {
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #a4231d;
}
.panel-leader-info strong {
  overflow: hidden;
  font-family: 'Anton', Impact, sans-serif;
  font-size: 22px;
  font-weight: 400;
  line-height: 1.05;
  text-transform: uppercase;
  text-overflow: ellipsis;
}
.panel-colors {
  display: flex;
  gap: 4px;
}
.panel-colors i {
  width: 14px;
  height: 14px;
  border: 1px solid rgba(35, 23, 8, 0.4);
  border-radius: 50%;
}
.panel-bounty {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 18px;
}
.panel-count {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.panel-count strong {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 44px;
  font-weight: 400;
  line-height: 1;
  color: #2f8a4f;
}
.panel-legal {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 2px;
  background: #2f8a4f;
  color: #fff8ec;
  font-size: 12px;
  font-weight: 600;
}
.panel-don {
  font-family: 'Bangers', 'Anton', Impact, sans-serif;
  font-size: 18px;
  letter-spacing: 0.06em;
  color: #c9312a;
  rotate: -4deg;
}
.panel-curve {
  grid-column: 1 / -1;
  padding-top: 10px;
  border-top: 1px dashed rgba(58, 38, 22, 0.3);
}
.bars {
  display: grid;
  grid-template-columns: repeat(11, 1fr);
  align-items: end;
  gap: 6px;
  height: 92px;
  margin-top: 8px;
}
.bar {
  position: relative;
  height: var(--h);
  min-height: 2px;
  border-radius: 2px 2px 0 0;
  background: linear-gradient(180deg, #c9312a, #8f1f19);
  transform-origin: bottom;
}
.bar em {
  position: absolute;
  bottom: -18px;
  left: 50%;
  translate: -50% 0;
  font-family: var(--font-mono);
  font-size: 10px;
  font-style: normal;
  color: #6b5236;
}
.rules {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}
.rules li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
}
.check {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 2px solid #231708;
  border-radius: 3px;
  background: #fff8ec;
  color: #2f8a4f;
}
.note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  color: #6b5236;
}
.cta--op {
  border: 2px solid #231708;
  border-radius: 3px;
  background: #231708;
  color: #fff8ec;
  font-family: 'Anton', Impact, sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  box-shadow: 4px 4px 0 #c9312a;
  transition: transform 0.3s cubic-bezier(0.3, 1.7, 0.5, 1);
}
.cta--op:hover {
  transform: translate(-2px, -2px) rotate(-1.5deg);
}

/* ---- Magic ---- */
.world--mtg {
  background:
    radial-gradient(700px 420px at 100% 100%, rgba(138, 106, 212, 0.16), transparent 60%),
    linear-gradient(180deg, #0b0910, #07060b);
  color: #f3ecda;
}
.world--mtg .kicker {
  font-family: 'Cinzel', ui-serif, Georgia, serif;
  font-weight: 700;
  color: #d4af5f;
}
.world--mtg .title {
  font-family: 'Cinzel', ui-serif, Georgia, serif;
  font-size: clamp(32px, 3.6vw, 56px);
  font-weight: 700;
}
.world--mtg .body {
  font-family: 'EB Garamond', ui-serif, Georgia, serif;
  font-size: 19px;
  color: #d6cbb1;
}
.stage {
  position: relative;
  height: 380px;
  max-width: 600px;
}
.fan {
  position: absolute;
  bottom: 10px;
  left: 10px;
  width: 300px;
  height: 260px;
}
.fan-card {
  position: absolute;
  bottom: 0;
  left: 70px;
  width: 132px;
  border-radius: 6px;
  box-shadow:
    0 0 0 1px rgba(212, 175, 95, 0.35),
    0 20px 34px -18px rgba(0, 0, 0, 0.95);
  transform-origin: 50% 120%;
  rotate: calc((var(--i) - (var(--n) - 1) / 2) * 11deg);
  transition: rotate 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}
.stage:hover .fan-card {
  rotate: calc((var(--i) - (var(--n) - 1) / 2) * 17deg);
}
.fan-card img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 6px;
}
.sheet {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  width: 210px;
  padding: 12px;
  background: #f7f4ee;
  box-shadow: 0 30px 50px -24px rgba(0, 0, 0, 0.9);
  rotate: 4deg;
}
.sheet-card {
  aspect-ratio: 63 / 88;
  background: #e2ddd2;
}
.sheet-card img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cut {
  position: absolute;
  background: rgba(0, 0, 0, 0.18);
}
.cut--v1,
.cut--v2 {
  top: 4px;
  bottom: 4px;
  width: 1px;
}
.cut--v1 {
  left: calc(12px + (100% - 24px) / 3);
}
.cut--v2 {
  left: calc(12px + 2 * (100% - 24px) / 3);
}
.cut--h1,
.cut--h2 {
  left: 4px;
  right: 4px;
  height: 1px;
}
.cut--h1 {
  top: calc(12px + (100% - 24px) / 3);
}
.cut--h2 {
  top: calc(12px + 2 * (100% - 24px) / 3);
}
.sheet-tag {
  position: absolute;
  right: 8px;
  bottom: -26px;
  padding: 2px 8px;
  border-radius: 2px;
  background: #d4af5f;
  color: #100c06;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  rotate: -4deg;
}
.coach {
  position: absolute;
  right: 12px;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 250px;
  padding: 12px;
  border: 1px solid rgba(212, 175, 95, 0.35);
  border-radius: 10px 10px 10px 2px;
  background: rgba(21, 17, 28, 0.94);
  box-shadow: 0 20px 40px -20px rgba(0, 0, 0, 0.9);
}
.coach-head {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'Cinzel', ui-serif, Georgia, serif;
  font-size: 12px;
  font-weight: 700;
  color: #d4af5f;
}
.coach p {
  margin: 0;
  font-family: 'EB Garamond', ui-serif, Georgia, serif;
  font-size: 15px;
  font-style: italic;
  color: #efe6d0;
}
.coach-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 6px;
  background: rgba(212, 175, 95, 0.08);
  font-size: 12px;
}
.coach-card img {
  width: 34px;
  height: 24px;
  border-radius: 3px;
  object-fit: cover;
}
.coach-card b {
  flex: 1;
  overflow: hidden;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.coach-card :deep(svg) {
  color: #8fd3a2;
}
.features {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}
.features li {
  padding: 5px 12px;
  border: 1px solid rgba(212, 175, 95, 0.35);
  border-radius: 999px;
  color: #e2c47f;
  font-size: 13px;
}
.cta--mtg {
  border: 1px solid #d4af5f;
  border-radius: 3px;
  background: transparent;
  color: #f1d994;
  font-family: 'Cinzel', ui-serif, Georgia, serif;
  font-weight: 700;
  letter-spacing: 0.06em;
  transition:
    background 0.6s ease,
    color 0.6s ease;
}
.cta--mtg:hover {
  background: #d4af5f;
  color: #100c06;
}

/* Scroll-driven entrances where the browser has them; still pages elsewhere. */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .bar {
      animation: grow linear both;
      animation-timeline: view();
      animation-range: entry 10% cover 40%;
    }
    .rules li {
      animation: tick linear both;
      animation-timeline: view();
      animation-range: entry 0% cover 30%;
    }
    .sheet {
      animation: settle linear both;
      animation-timeline: view();
      animation-range: entry 0% cover 45%;
    }
  }
}
@keyframes grow {
  from {
    transform: scaleY(0.15);
  }
}
@keyframes tick {
  from {
    opacity: 0.35;
    transform: translateX(-12px);
  }
}
@keyframes settle {
  from {
    transform: translateY(40px) rotate(12deg);
  }
}

@media (max-width: 1100px) {
  .stage {
    height: 440px;
  }
  .coach {
    right: auto;
    left: 0;
    bottom: -10px;
  }
  .fan {
    left: auto;
    right: 0;
    bottom: 60px;
  }
}
@media (max-width: 900px) {
  .worlds {
    grid-template-columns: 1fr;
  }
  .world {
    padding: 70px 20px 80px;
  }
  .panel {
    grid-template-columns: 1fr;
  }
  .panel-count {
    align-items: flex-start;
  }
  .stage {
    height: 470px;
  }
  .sheet {
    width: 180px;
  }
  .fan {
    width: 250px;
  }
  .fan-card {
    width: 110px;
    left: 60px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .fan-card,
  .cta {
    transition: none;
  }
}
</style>
