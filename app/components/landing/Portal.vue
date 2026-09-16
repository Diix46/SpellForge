<script setup lang="ts">
import type { OptcgCard } from '#shared/optcg/types'
import { computed, shallowRef, watch } from 'vue'
import { libraryPath } from '#shared/game'

// The landing portal: no default game. The screen is cut in two and the halves
// look nothing alike: on the left the sea, a ship riding the waves and gulls
// over yellowed paper; on the right a summoning circle turning and embers
// rising from obsidian. The seam in the middle is the only thing both share:
// the prism. Hovering a half widens it, each at its own pace.
const { t, locale, setLocale } = useLocale()
const { show: openAuth } = useAuthOverlay()
const { pool: magicPool } = useLandingCards()

const posters = shallowRef<OptcgCard[]>([])
watch(locale, async (lang) => {
  try {
    posters.value = (await $fetch<{ cards: OptcgCard[] }>('/api/landing/optcg', { query: { lang } })).cards.slice(0, 3)
  }
  catch {
    posters.value = []
  }
}, { immediate: true })

const grimoire = computed(() => magicPool.value.slice(0, 3))

const hovered = shallowRef<'op' | 'mtg' | null>(null)
</script>

<template>
  <section class="portal" :class="hovered && `portal--${hovered}`">
    <header class="bar">
      <span class="brand"><AppLogo /></span>
      <div class="bar-right">
        <div class="lang">
          <button :class="{ on: locale === 'fr' }" aria-label="Français" @click="setLocale('fr')">
            FR
          </button>
          <button :class="{ on: locale === 'en' }" aria-label="English" @click="setLocale('en')">
            EN
          </button>
        </div>
        <button type="button" class="login" @click="openAuth('login')">
          {{ t('auth.login') }}
        </button>
      </div>
    </header>

    <!-- One Piece: broad daylight -->
    <NuxtLink
      :to="libraryPath('optcg')"
      class="half half--op"
      @pointerenter="hovered = 'op'"
      @pointerleave="hovered = null"
      @focus="hovered = 'op'"
      @blur="hovered = null"
    >
      <FxOnePieceSea class="half-fx" />
      <div class="half-body">
        <p class="eyebrow">
          {{ t('portal.op.eyebrow') }}
        </p>
        <h2 class="half-title">
          {{ t('portal.op.title') }}
        </h2>
        <p class="half-text">
          {{ t('portal.op.text') }}
        </p>
        <ul class="features">
          <li>{{ t('portal.op.f1') }}</li>
          <li>{{ t('portal.op.f2') }}</li>
          <li>{{ t('portal.op.f3') }}</li>
          <li class="off">
            {{ t('portal.op.f4') }}
          </li>
        </ul>
        <span class="enter">{{ t('portal.enter') }} <UIcon name="i-lucide-arrow-right" class="h-4 w-4" /></span>
      </div>
      <div class="posters" aria-hidden="true">
        <span v-for="(c, i) in posters" :key="c.id" class="poster" :style="{ '--i': i }">
          <span class="poster-pin" />
          <img :src="c.image" alt="">
        </span>
      </div>
    </NuxtLink>

    <!-- the seam -->
    <div class="seam">
      <div class="seam-card">
        <svg class="prism" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 4 L20 36 L7 20 Z" fill="#c9312a" />
          <path d="M20 4 L33 20 L20 36 Z" fill="#d4af5f" />
          <path d="M20 4 L20 36" stroke="#fff8ec" stroke-width="1" opacity=".6" />
        </svg>
        <p class="seam-title">
          {{ t('portal.title') }}
        </p>
        <p class="seam-sub">
          {{ t('portal.sub') }}
        </p>
        <button type="button" class="seam-cta" @click="openAuth('register')">
          {{ t('portal.register') }}
        </button>
      </div>
    </div>

    <!-- Magic: night -->
    <NuxtLink
      :to="libraryPath('mtg')"
      class="half half--mtg"
      @pointerenter="hovered = 'mtg'"
      @pointerleave="hovered = null"
      @focus="hovered = 'mtg'"
      @blur="hovered = null"
    >
      <FxMagicSanctum class="half-fx" />
      <div class="half-body">
        <p class="eyebrow">
          {{ t('portal.mtg.eyebrow') }}
        </p>
        <h2 class="half-title">
          {{ t('portal.mtg.title') }}
        </h2>
        <p class="half-text">
          {{ t('portal.mtg.text') }}
        </p>
        <ul class="features">
          <li>{{ t('portal.mtg.f1') }}</li>
          <li>{{ t('portal.mtg.f2') }}</li>
          <li>{{ t('portal.mtg.f3') }}</li>
          <li>{{ t('portal.mtg.f4') }}</li>
        </ul>
        <span class="enter">{{ t('portal.enter') }} <UIcon name="i-lucide-arrow-right" class="h-4 w-4" /></span>
      </div>
      <div class="pages" aria-hidden="true">
        <span v-for="(c, i) in grimoire" :key="c.image" class="page" :style="{ '--i': i }">
          <img :src="c.image" alt="">
        </span>
      </div>
    </NuxtLink>
  </section>
</template>

<style scoped>
.portal {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 0 1fr;
  min-height: 100dvh;
  overflow: hidden;
  transition: grid-template-columns 0.7s cubic-bezier(0.4, 0, 0.2, 1);
}
.portal--op {
  grid-template-columns: 1.25fr 0 0.75fr;
  transition-timing-function: cubic-bezier(0.3, 1.5, 0.5, 1);
}
.portal--mtg {
  grid-template-columns: 0.75fr 0 1.25fr;
}

.bar {
  position: absolute;
  inset: 0 0 auto;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  pointer-events: none;
}
.bar > * {
  pointer-events: auto;
}
.brand {
  display: inline-flex;
  padding: 6px 12px;
  border-radius: 6px;
  background: rgba(16, 13, 20, 0.82);
}
.bar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lang {
  display: flex;
  padding: 2px;
  border-radius: 6px;
  background: rgba(16, 13, 20, 0.75);
}
.lang button {
  padding: 3px 9px;
  border-radius: 4px;
  font-size: 12px;
  color: #b9ac8e;
}
.lang button.on {
  background: #d4af5f;
  color: #100c06;
}
.login {
  padding: 7px 14px;
  border: 1px solid rgba(212, 175, 95, 0.5);
  border-radius: 4px;
  background: rgba(16, 13, 20, 0.75);
  color: #f3ecda;
  font-size: 13px;
}
.login:hover {
  border-color: #d4af5f;
}

.half {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 110px clamp(24px, 5vw, 72px) 70px;
  overflow: hidden;
  text-decoration: none;
  isolation: isolate;
}
.half-fx {
  position: absolute !important;
  z-index: 0 !important;
}
.half-body {
  position: relative;
  z-index: 2;
  max-width: 440px;
}
.eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
}
.half-title {
  margin: 0;
  line-height: 0.95;
}
.half-text {
  max-width: 38ch;
  margin: 14px 0 0;
  font-size: 16px;
  line-height: 1.55;
}
.features {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}
.features li {
  padding: 3px 10px;
  font-size: 12px;
}
.enter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 26px;
  padding: 12px 22px;
  font-size: 15px;
}

/* ---- One Piece half ---- */
.half--op {
  background:
    radial-gradient(700px 400px at 20% 10%, rgba(233, 167, 44, 0.25), transparent 60%),
    linear-gradient(180deg, #f3e6c9, #e8d5b0);
  color: #231708;
  --u-sea: #1d6f92;
}
.half--op .eyebrow {
  font-family: 'Bangers', 'Anton', Impact, sans-serif;
  letter-spacing: 0.12em;
  color: #a4231d;
}
.half--op .half-title {
  font-family: 'Anton', Impact, sans-serif;
  font-size: clamp(46px, 6.4vw, 92px);
  text-transform: uppercase;
  rotate: -2deg;
}
.half--op .half-text {
  color: #45321d;
}
.half--op .features li {
  border: 1px solid rgba(58, 38, 22, 0.35);
  border-radius: 2px;
  background: #fbf3e3;
}
.half--op .features li.off {
  text-decoration: line-through;
  opacity: 0.6;
}
.half--op .enter {
  border: 2px solid #231708;
  border-radius: 3px;
  background: #c9312a;
  color: #fff8ec;
  font-family: 'Anton', Impact, sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  box-shadow: 4px 4px 0 #231708;
  transition:
    transform 0.3s cubic-bezier(0.3, 1.7, 0.5, 1),
    box-shadow 0.3s ease;
}
.half--op:hover .enter {
  transform: translate(-2px, -2px) rotate(-2deg);
  box-shadow: 7px 7px 0 #231708;
}
.posters {
  position: absolute;
  right: clamp(24px, 4vw, 64px);
  bottom: 48px;
  z-index: 1;
  width: 300px;
  height: 300px;
  pointer-events: none;
  transition: opacity 0.4s ease;
}
/* the shrinking half keeps its words, and lets its cards fade */
.portal--mtg .posters,
.portal--op .pages {
  opacity: 0.2;
}
.poster {
  position: absolute;
  right: calc(var(--i) * 70px);
  bottom: calc(var(--i) * 26px);
  width: 150px;
  padding: 16px 6px 6px;
  border: 1px solid rgba(58, 38, 22, 0.35);
  background: #fbf3e3;
  box-shadow: 0 16px 30px -16px rgba(58, 38, 22, 0.7);
  rotate: calc(-8deg + var(--i) * 7deg);
  transition:
    rotate 0.5s cubic-bezier(0.3, 1.7, 0.5, 1),
    translate 0.5s cubic-bezier(0.3, 1.7, 0.5, 1);
}
.half--op:hover .poster {
  rotate: calc(-12deg + var(--i) * 10deg);
  translate: calc(var(--i) * -12px) -8px;
}
.poster img {
  display: block;
  width: 100%;
  aspect-ratio: 600 / 838;
  object-fit: cover;
  border: 2px solid #3a2616;
}
.poster-pin {
  position: absolute;
  top: 4px;
  left: 50%;
  width: 10px;
  height: 10px;
  translate: -50% 0;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ef6b5d, #c9312a 55%, #7a1a14);
}

/* ---- Magic half ---- */
.half--mtg {
  background:
    radial-gradient(700px 420px at 80% 90%, rgba(138, 106, 212, 0.18), transparent 60%),
    linear-gradient(180deg, #0b0910, #07060b);
  color: #f3ecda;
  --accent-rgb: 212, 175, 95;
}
.half--mtg .half-body {
  margin-left: auto;
  text-align: right;
}
.half--mtg .eyebrow {
  font-family: 'Cinzel', ui-serif, Georgia, serif;
  font-weight: 700;
  color: #d4af5f;
}
.half--mtg .half-title {
  font-family: 'Cinzel', ui-serif, Georgia, serif;
  font-weight: 700;
  font-size: clamp(40px, 5.4vw, 78px);
  letter-spacing: 0.02em;
}
.half--mtg .half-text {
  margin-left: auto;
  font-family: 'EB Garamond', ui-serif, Georgia, serif;
  font-style: italic;
  font-size: 19px;
  color: #d6cbb1;
}
.half--mtg .features {
  justify-content: flex-end;
}
.half--mtg .features li {
  border: 1px solid rgba(212, 175, 95, 0.35);
  border-radius: 999px;
  color: #e2c47f;
}
.half--mtg .enter {
  border: 1px solid #d4af5f;
  border-radius: 3px;
  color: #100c06;
  background: linear-gradient(180deg, #e6c97f, #c9a24e);
  font-family: 'Cinzel', ui-serif, Georgia, serif;
  font-weight: 700;
  letter-spacing: 0.08em;
  box-shadow: 0 0 24px -6px rgba(212, 175, 95, 0.7);
  transition: box-shadow 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}
.half--mtg:hover .enter {
  box-shadow: 0 0 40px -2px rgba(212, 175, 95, 0.9);
}
.pages {
  position: absolute;
  left: clamp(24px, 4vw, 64px);
  bottom: 48px;
  z-index: 1;
  width: 300px;
  height: 300px;
  pointer-events: none;
  transition: opacity 0.6s ease;
}
.page {
  position: absolute;
  left: calc(var(--i) * 74px);
  bottom: calc(var(--i) * 20px);
  width: 150px;
  padding: 5px;
  border: 1px solid rgba(212, 175, 95, 0.45);
  outline: 1px solid rgba(212, 175, 95, 0.15);
  outline-offset: 3px;
  background: #100d14;
  box-shadow: 0 20px 40px -18px rgba(0, 0, 0, 0.9);
  transition:
    translate 1s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 1s ease;
}
.half--mtg:hover .page {
  translate: 0 calc(-6px - var(--i) * 6px);
  box-shadow: 0 24px 50px -16px rgba(212, 175, 95, 0.35);
}
.page img {
  display: block;
  width: 100%;
  aspect-ratio: 63 / 88;
  border-radius: 4.5% / 3.2%;
  object-fit: cover;
}

/* ---- the seam ---- */
.seam {
  position: relative;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 0;
  overflow: visible;
}
.seam::before {
  content: '';
  position: absolute;
  inset: 0 auto;
  left: -1px;
  width: 2px;
  background: linear-gradient(180deg, transparent, #c9312a 30%, #d4af5f 70%, transparent);
}
.seam-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 244px;
  padding: 34px 20px 18px;
  border: 1px solid transparent;
  border-radius: 6px;
  background:
    linear-gradient(#100d14, #100d14) padding-box,
    linear-gradient(90deg, #c9312a, #d4af5f) border-box;
  box-shadow: 0 18px 40px -16px rgba(0, 0, 0, 0.7);
  text-align: center;
}
.prism {
  position: absolute;
  top: -26px;
  width: 52px;
  height: 52px;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.45));
}
.seam-title,
.seam-sub {
  margin: 0;
  text-wrap: balance;
}
.seam-title {
  color: #f3ecda;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}
.seam-sub {
  font-size: 12.5px;
  line-height: 1.45;
  color: #b9ac8e;
}
.seam-cta {
  margin-top: 6px;
  padding: 7px 16px;
  border: 1px solid rgba(243, 236, 218, 0.45);
  border-radius: 999px;
  color: #f3ecda;
  font-size: 12.5px;
  white-space: nowrap;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;
}
.seam-cta:hover {
  border-color: #f3ecda;
  background: rgba(243, 236, 218, 0.08);
}

@media (max-width: 900px) {
  .portal,
  .portal--op,
  .portal--mtg {
    grid-template-columns: 1fr;
  }
  .half {
    min-height: 80dvh;
  }
  .seam {
    width: auto;
    padding: 48px 16px 28px;
    background: linear-gradient(90deg, #efdfc0, #07060b);
  }
  .seam::before {
    display: none;
  }
  .half--mtg .half-body,
  .half--mtg .half-text {
    margin-left: 0;
    text-align: left;
  }
  .half--mtg .features {
    justify-content: flex-start;
  }
  .posters,
  .pages {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .portal,
  .poster,
  .page,
  .enter {
    transition: none;
  }
}
</style>
