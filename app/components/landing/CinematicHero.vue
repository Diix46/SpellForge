<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAuthOverlay } from '~/composables/useAuthOverlay'
import { useLocale } from '~/composables/useLocale'

// Cinematic full-bleed gallery hero: a real MTG artwork fills the screen, slowly
// Ken-Burns zooms, and crossfades to the next every few seconds. The whole hero's
// accent (title gradient, CTA glow, progress) reacts to the current card's colour.
// A discreet gallery credit (card name + artist) sits bottom-left. Pure
// CSS/transforms; honours prefers-reduced-motion (no zoom, no auto-advance).

interface LandingCard { name: string, art: string, artist: string, colors: string[] }

const { t, locale, setLocale } = useLocale()
const { show: openAuth } = useAuthOverlay()

const ROTATE_MS = 6500

// Accent RGB per WUBRG (mirrors the brand mana colours); colourless → warm gold.
const COLOR_RGB: Record<string, string> = {
  w: '233,205,120',
  u: '79,168,232',
  b: '150,120,200',
  r: '232,88,68',
  g: '56,184,131',
}
function accentFor(colors: string[]): string {
  const c = colors.find(x => COLOR_RGB[x])
  return c ? COLOR_RGB[c]! : '210,180,120' // multicolour/colourless → gold
}

const cards = ref<LandingCard[]>([])
const index = ref(0)
const ready = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
let reduce = false

const current = computed(() => cards.value[index.value] ?? null)
const accent = computed(() => (current.value ? accentFor(current.value.colors) : '210,180,120'))

function go(i: number) {
  if (!cards.value.length)
    return
  index.value = (i + cards.value.length) % cards.value.length
}
function next() {
  go(index.value + 1)
}

function startRotation() {
  if (reduce || timer || cards.value.length < 2)
    return
  timer = setInterval(next, ROTATE_MS)
}
function stopRotation() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
// Manual pick resets the timer so the chosen card lingers a full beat.
function pick(i: number) {
  go(i)
  stopRotation()
  startRotation()
}

async function load() {
  try {
    const { cards: pool } = await $fetch<{ cards: LandingCard[] }>('/api/landing/cards', {
      query: { _: Date.now() },
    })
    // Keep a handful for the gallery rotation; shuffle for per-visit variety.
    cards.value = (pool ?? []).filter(c => c.art).sort(() => Math.random() - 0.5).slice(0, 8)
    ready.value = cards.value.length > 0
    startRotation()
  }
  catch {
    ready.value = false // graceful: the gradient backdrop alone still looks fine
  }
}

onMounted(() => {
  reduce = import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  load()
})
onBeforeUnmount(stopRotation)
</script>

<template>
  <section class="cine" :style="{ '--accent': accent }">
    <!-- ===== Full-bleed crossfading artwork stage ===== -->
    <div class="stage" aria-hidden="true">
      <div
        v-for="(c, i) in cards"
        :key="c.name + i"
        class="frame"
        :class="{ on: i === index, kb: i === index && !reduce }"
        :style="{ backgroundImage: `url(${c.art})` }"
      />
      <!-- Legibility scrim + accent wash + film grain -->
      <div class="scrim" />
      <div class="wash" />
      <div class="grain" />
    </div>

    <!-- ===== Top bar ===== -->
    <header class="bar">
      <AppLogo />
      <div class="bar-right">
        <div class="lang">
          <button :class="{ on: locale === 'fr' }" aria-label="Français" @click="setLocale('fr')">
            FR
          </button>
          <button :class="{ on: locale === 'en' }" aria-label="English" @click="setLocale('en')">
            EN
          </button>
        </div>
        <button type="button" class="ghost" @click="openAuth('login')">
          {{ t('auth.login') }}
        </button>
        <button type="button" class="cta cta--sm" @click="openAuth('register')">
          {{ t('landing.ctaPrimary') }}
        </button>
      </div>
    </header>

    <!-- ===== Hero copy ===== -->
    <div class="copy">
      <span class="eyebrow">
        <span class="dot" />{{ t('landing.badge') }}
      </span>
      <h1 class="title">
        <span class="l1">{{ t('landing.title1') }}</span>
        <span class="l2">{{ t('landing.title2') }}</span>
      </h1>
      <p class="sub">
        {{ t('landing.subtitle') }}
      </p>
      <div class="actions">
        <button type="button" class="cta" @click="openAuth('register')">
          <UIcon name="i-lucide-sparkles" class="h-[18px] w-[18px]" />
          {{ t('landing.ctaPrimary') }}
          <UIcon name="i-lucide-arrow-right" class="h-[18px] w-[18px] arr" />
        </button>
        <button type="button" class="ghost ghost--lg" @click="openAuth('login')">
          {{ t('landing.ctaSecondary') }}
        </button>
      </div>
    </div>

    <!-- ===== Gallery credit + progress (bottom) ===== -->
    <div class="gallery">
      <Transition name="credit" mode="out-in">
        <div v-if="current" :key="current.name" class="credit">
          <span class="credit-card">{{ current.name }}</span>
          <span v-if="current.artist" class="credit-art">{{ t('landing.illus') }} {{ current.artist }}</span>
        </div>
      </Transition>
      <div v-if="cards.length > 1" class="dots" role="tablist">
        <button
          v-for="(c, i) in cards"
          :key="c.name + i"
          type="button"
          class="dot-btn"
          :class="{ on: i === index }"
          :aria-label="c.name"
          @click="pick(i)"
        >
          <span class="dot-fill" :style="i === index && !reduce ? { animationDuration: `${ROTATE_MS}ms` } : {}" />
        </button>
      </div>
    </div>

    <div class="scroll" aria-hidden="true">
      <UIcon name="i-lucide-chevron-down" />
    </div>
  </section>
</template>

<style scoped>
.cine {
  position: relative;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  isolation: isolate;
  color: #f4f1ea;
}

/* ===== Artwork stage ===== */
.stage {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: #08070a;
}
.frame {
  position: absolute;
  inset: -4%; /* bleed so the Ken-Burns zoom never reveals an edge */
  background-size: cover;
  background-position: center;
  opacity: 0;
  transition: opacity 1.6s ease;
  will-change: opacity, transform;
}
.frame.on {
  opacity: 1;
}
.frame.kb {
  animation: kenburns 8s ease-out forwards;
}
@keyframes kenburns {
  from {
    transform: scale(1.02) translate(0, 0);
  }
  to {
    transform: scale(1.14) translate(-1.5%, -1.5%);
  }
}
/* Dark scrim weighted to the left/bottom where the copy lives */
.scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      105deg,
      rgba(8, 7, 10, 0.92) 0%,
      rgba(8, 7, 10, 0.62) 38%,
      rgba(8, 7, 10, 0.15) 70%,
      transparent 100%
    ),
    linear-gradient(0deg, rgba(8, 7, 10, 0.95) 2%, transparent 32%),
    linear-gradient(180deg, rgba(8, 7, 10, 0.7) 0%, transparent 22%);
}
/* Accent colour wash tying the page to the current card's identity */
.wash {
  position: absolute;
  inset: 0;
  background: radial-gradient(80% 60% at 75% 30%, rgba(var(--accent), 0.22), transparent 70%);
  mix-blend-mode: screen;
  transition: background 1.6s ease;
}
.grain {
  position: absolute;
  inset: 0;
  opacity: 0.5;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
}

/* ===== Top bar ===== */
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px clamp(20px, 5vw, 64px);
}
.bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.lang {
  display: inline-flex;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  overflow: hidden;
}
.lang button {
  padding: 5px 11px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: rgba(244, 241, 234, 0.55);
  transition:
    color 0.2s,
    background 0.2s;
}
.lang button.on {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
}
.ghost {
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 500;
  color: #f4f1ea;
  border-radius: 10px;
  border: 1px solid transparent;
  transition:
    background 0.2s,
    border-color 0.2s;
}
.ghost:hover {
  background: rgba(255, 255, 255, 0.08);
}
.ghost--lg {
  padding: 15px 24px;
  font-size: 15px;
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.04);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.ghost--lg:hover {
  border-color: rgba(var(--accent), 0.7);
  background: rgba(var(--accent), 0.12);
}

/* ===== Hero copy ===== */
.copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  max-width: min(760px, 92vw);
  padding: 0 clamp(20px, 5vw, 64px);
  text-align: left;
}
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  margin-bottom: 26px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(244, 241, 234, 0.8);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  animation: rise 0.7s 0.05s ease both;
}
.eyebrow .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(var(--accent));
  box-shadow: 0 0 10px 1px rgb(var(--accent));
  transition:
    background 1.6s ease,
    box-shadow 1.6s ease;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2.8rem, 8.5vw, 6.2rem);
  line-height: 0.94;
  letter-spacing: -0.045em;
  text-wrap: balance;
}
.title .l1 {
  display: block;
  color: #f6f3ec;
  text-shadow: 0 2px 40px rgba(0, 0, 0, 0.5);
  animation: rise 0.8s 0.12s ease both;
}
.title .l2 {
  display: block;
  background: linear-gradient(100deg, rgb(var(--accent)), #fff 90%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  transition: background 1.6s ease;
  animation: rise 0.8s 0.2s ease both;
}
.sub {
  max-width: 50ch;
  margin: 28px 0 0;
  font-size: clamp(1rem, 1.6vw, 1.2rem);
  line-height: 1.65;
  color: rgba(244, 241, 234, 0.82);
  text-shadow: 0 1px 20px rgba(0, 0, 0, 0.5);
  animation: rise 0.8s 0.3s ease both;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 40px;
  animation: rise 0.8s 0.4s ease both;
}
.cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 16px 28px;
  font-size: 15.5px;
  font-weight: 600;
  color: #0a0a0b;
  border-radius: 12px;
  background: rgb(var(--accent));
  box-shadow:
    0 0 0 1px rgba(var(--accent), 0.5),
    0 16px 44px -12px rgba(var(--accent), 0.8);
  transition:
    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.25s,
    background 1.6s ease;
}
.cta:hover {
  transform: translateY(-3px);
  box-shadow:
    0 0 0 1px rgba(var(--accent), 0.7),
    0 22px 56px -12px rgba(var(--accent), 1);
}
.cta .arr {
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.cta:hover .arr {
  transform: translateX(4px);
}
.cta--sm {
  padding: 9px 18px;
  font-size: 14px;
  border-radius: 10px;
  box-shadow:
    0 0 0 1px rgba(var(--accent), 0.4),
    0 8px 22px -8px rgba(var(--accent), 0.7);
}
.cta--sm:hover {
  transform: translateY(-2px);
}

/* ===== Gallery credit + progress ===== */
.gallery {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 0 clamp(20px, 5vw, 64px) 30px;
}
.credit {
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: rise 0.8s 0.5s ease both;
}
.credit-card {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: rgba(244, 241, 234, 0.92);
}
.credit-art {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgba(244, 241, 234, 0.5);
}
.credit-enter-active,
.credit-leave-active {
  transition:
    opacity 0.5s ease,
    transform 0.5s ease;
}
.credit-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.credit-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.dots {
  display: flex;
  gap: 8px;
}
.dot-btn {
  position: relative;
  width: 34px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  overflow: hidden;
  transition: background 0.3s;
}
.dot-btn:hover {
  background: rgba(255, 255, 255, 0.4);
}
.dot-btn.on {
  background: rgba(255, 255, 255, 0.25);
}
.dot-fill {
  position: absolute;
  inset: 0;
  width: 0;
  background: rgb(var(--accent));
  transition: background 1.6s ease;
}
.dot-btn.on .dot-fill {
  animation: fill linear forwards;
}
@keyframes fill {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}

.scroll {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(244, 241, 234, 0.5);
  font-size: 20px;
  animation: bob 2s ease-in-out infinite;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(22px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes bob {
  0%,
  100% {
    transform: translate(-50%, 0);
    opacity: 0.5;
  }
  50% {
    transform: translate(-50%, 7px);
    opacity: 1;
  }
}

@media (max-width: 720px) {
  .gallery {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .frame {
    transition: opacity 0.3s ease;
  }
  .frame.kb,
  .scroll,
  .eyebrow,
  .title .l1,
  .title .l2,
  .sub,
  .actions,
  .credit {
    animation: none;
  }
  .dot-btn.on .dot-fill {
    animation: none;
    width: 100%;
  }
}
</style>
