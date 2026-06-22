<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthOverlay } from '~/composables/useAuthOverlay'
import { useLocale } from '~/composables/useLocale'
import { useScrollReveal } from '~/composables/useScrollReveal'

// Public marketing landing for guests (the only full-content page behind the auth
// wall that signed-out users may see). Brings its own minimal header — the app
// shell chrome is hidden for guests. CTAs open the shared AuthModal.

definePageMeta({ name: 'landing' })

const { t, locale, setLocale } = useLocale()
const { show: openAuth } = useAuthOverlay()

useSeoMeta({
  title: 'Spellforge — Deck manager & proxy printer',
  description: () => t('landing.subtitle'),
})

const root = ref<HTMLElement | null>(null)
useScrollReveal(() => root.value)

// Marquee: split the ·-list into discrete feature words, repeated 3× so the
// ribbon always fills any viewport width and loops seamlessly (each of the two
// tracks holds the full triple-repeat; translating one track-width is invisible).
const marqueeWords = computed(() => {
  const words = t('landing.marquee').split('·').map(w => w.trim()).filter(Boolean)
  return [...words, ...words, ...words]
})

const FEATURES = [
  { icon: 'i-lucide-wand-sparkles', key: 'f1', glow: '79,168,232' },
  { icon: 'i-lucide-printer', key: 'f2', glow: '56,184,131' },
  { icon: 'i-lucide-link', key: 'f3', glow: '168,85,247' },
  { icon: 'i-lucide-euro', key: 'f4', glow: '233,196,106' },
  { icon: 'i-lucide-palette', key: 'f5', glow: '232,88,68' },
  { icon: 'i-lucide-zap', key: 'f6', glow: '79,168,232' },
] as const

const STEPS = [
  { n: '01', icon: 'i-lucide-square-plus', key: 's1' },
  { n: '02', icon: 'i-lucide-sparkles', key: 's2' },
  { n: '03', icon: 'i-lucide-printer', key: 's3' },
] as const

// Tilt a feature card toward the pointer (juicy, on-brand with the app's tilt).
function onTilt(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  const rx = ((e.clientY - r.top) / r.height - 0.5) * -8
  const ry = ((e.clientX - r.left) / r.width - 0.5) * 8
  el.style.setProperty('--rx', `${rx}deg`)
  el.style.setProperty('--ry', `${ry}deg`)
  el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
  el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
}
function resetTilt(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  el.style.setProperty('--rx', '0deg')
  el.style.setProperty('--ry', '0deg')
}
</script>

<template>
  <div ref="root" class="lp">
    <!-- ============ Minimal header ============ -->
    <header class="lp-head">
      <div class="lp-head-inner">
        <AppLogo />
        <div class="lp-head-right">
          <div class="lang">
            <button :class="{ on: locale === 'fr' }" aria-label="Français" @click="setLocale('fr')">
              FR
            </button>
            <button :class="{ on: locale === 'en' }" aria-label="English" @click="setLocale('en')">
              EN
            </button>
          </div>
          <button type="button" class="ghost-btn" @click="openAuth('login')">
            {{ t('auth.login') }}
          </button>
          <button type="button" class="solid-btn" @click="openAuth('register')">
            {{ t('landing.ctaPrimary') }}
          </button>
        </div>
      </div>
    </header>

    <!-- ============ HERO ============ -->
    <section class="hero">
      <LandingHeroBackdrop />

      <div class="hero-content">
        <span class="badge" data-reveal>
          <span class="badge-dot" />
          {{ t('landing.badge') }}
        </span>

        <h1 class="hero-title" data-reveal>
          <span class="ln">{{ t('landing.title1') }}</span>
          <span class="ln grad">{{ t('landing.title2') }}</span>
        </h1>

        <p class="hero-sub" data-reveal>
          {{ t('landing.subtitle') }}
        </p>

        <div class="hero-cta" data-reveal>
          <button type="button" class="cta-primary" @click="openAuth('register')">
            <UIcon name="i-lucide-sparkles" class="h-[18px] w-[18px]" />
            {{ t('landing.ctaPrimary') }}
            <UIcon name="i-lucide-arrow-right" class="h-[18px] w-[18px] arr" />
          </button>
          <button type="button" class="cta-ghost" @click="openAuth('login')">
            {{ t('landing.ctaSecondary') }}
          </button>
        </div>

        <p class="hero-trust" data-reveal>
          {{ t('landing.trust') }}
        </p>
      </div>

      <div class="scroll-hint" aria-hidden="true">
        <UIcon name="i-lucide-chevron-down" />
      </div>
    </section>

    <!-- ============ Marquee ============ -->
    <div class="marquee" aria-hidden="true">
      <div class="marquee-track">
        <span v-for="(w, i) in marqueeWords" :key="`a${i}`" class="mq-item">
          <span class="mq-dot" />{{ w }}
        </span>
      </div>
      <div class="marquee-track" aria-hidden="true">
        <span v-for="(w, i) in marqueeWords" :key="`b${i}`" class="mq-item">
          <span class="mq-dot" />{{ w }}
        </span>
      </div>
    </div>

    <!-- ============ FEATURES (bento) ============ -->
    <section class="section">
      <div class="sec-head" data-reveal>
        <span class="kicker">{{ t('landing.featuresKicker') }}</span>
        <h2 class="sec-title">
          {{ t('landing.featuresTitle') }}
        </h2>
      </div>

      <div class="bento">
        <article
          v-for="(f, i) in FEATURES"
          :key="f.key"
          class="feat"
          data-reveal
          :style="{ '--glow': f.glow, '--d': `${i * 70}ms` }"
          @pointermove="onTilt"
          @pointerleave="resetTilt"
        >
          <div class="feat-shine" />
          <div class="feat-ic">
            <UIcon :name="f.icon" class="h-6 w-6" />
          </div>
          <h3 class="feat-title">
            {{ t(`landing.${f.key}Title`) }}
          </h3>
          <p class="feat-body">
            {{ t(`landing.${f.key}Body`) }}
          </p>
        </article>
      </div>
    </section>

    <!-- ============ STEPS ============ -->
    <section class="section">
      <div class="sec-head" data-reveal>
        <span class="kicker">{{ t('landing.stepsKicker') }}</span>
        <h2 class="sec-title">
          {{ t('landing.stepsTitle') }}
        </h2>
      </div>

      <div class="steps">
        <div class="steps-line" aria-hidden="true" />
        <article
          v-for="(s, i) in STEPS"
          :key="s.key"
          class="step"
          data-reveal
          :style="{ '--d': `${i * 120}ms` }"
        >
          <div class="step-badge">
            <UIcon :name="s.icon" class="h-5 w-5" />
            <span class="step-n">{{ s.n }}</span>
          </div>
          <h3 class="step-title">
            {{ t(`landing.${s.key}Title`) }}
          </h3>
          <p class="step-body">
            {{ t(`landing.${s.key}Body`) }}
          </p>
        </article>
      </div>
    </section>

    <!-- ============ FINAL CTA ============ -->
    <section class="section">
      <div class="final" data-reveal>
        <div class="final-aurora" aria-hidden="true" />
        <span class="kicker">{{ t('landing.finalKicker') }}</span>
        <h2 class="final-title">
          {{ t('landing.finalTitle') }}
        </h2>
        <p class="final-body">
          {{ t('landing.finalBody') }}
        </p>
        <button type="button" class="cta-primary big" @click="openAuth('register')">
          <UIcon name="i-lucide-sparkles" class="h-5 w-5" />
          {{ t('landing.finalCta') }}
          <UIcon name="i-lucide-arrow-right" class="h-5 w-5 arr" />
        </button>
      </div>
    </section>

    <!-- ============ Footer ============ -->
    <footer class="lp-foot">
      <div class="lp-foot-brand">
        <AppLogo :wordmark="false" :size="20" />
        <span class="lp-foot-name">Spellforge</span>
      </div>
      <p class="lp-foot-copy">
        {{ t('landing.copyright') }}
      </p>
    </footer>
  </div>
</template>

<style scoped>
/* The marketing landing is ALWAYS dark — the glow/aurora/neon effects depend on a
   dark canvas, and a hero like this reads as premium in dark regardless of the
   app's light/dark preference. So we pin the dark token values locally (they'd
   otherwise be overridden by the light theme's :root) and set a bolder
   mana-spectrum accent (cyan → violet) so it pops. */
.lp {
  --lp-a: 79, 168, 232; /* cyan */
  --lp-b: 168, 85, 247; /* violet */
  /* Dark surface system, pinned (mirrors main.css :root dark defaults). */
  --color-bg-base: #0a0a0b;
  --color-bg-base-2: #0e0e10;
  --color-surface-1: #141416;
  --color-surface-2: #1c1c1f;
  --color-surface-3: #26262a;
  --color-text-high: #f4f4f5;
  --color-text-mid: #c8c8cd;
  --color-text-muted: #8e8e96;
  --color-text-disabled: #6a6a72;
  --color-border-subtle: rgba(255, 255, 255, 0.08);
  --color-border-strong: rgba(255, 255, 255, 0.16);
  position: relative;
  min-height: 100dvh;
  background: var(--color-bg-base);
  color: var(--color-text-high);
  overflow-x: hidden;
}

/* ---------- Header ---------- */
.lp-head {
  position: sticky;
  top: 0;
  z-index: 50;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  background: linear-gradient(180deg, rgba(10, 10, 11, 0.7), transparent);
}
.lp-head-inner {
  max-width: 1180px;
  margin: 0 auto;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.lp-head-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.lang {
  display: inline-flex;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.lang button {
  padding: 5px 11px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  transition:
    color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out);
}
.lang button.on {
  color: var(--color-text-high);
  background: var(--color-surface-2);
}
.ghost-btn {
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-mid);
  border-radius: var(--radius-md);
  transition:
    color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out);
}
.ghost-btn:hover {
  color: var(--color-text-high);
  background: var(--color-surface-2);
}
.solid-btn {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #0a0a0b;
  border-radius: var(--radius-md);
  background: linear-gradient(120deg, rgb(var(--lp-a)), rgb(var(--lp-b)));
  box-shadow: 0 8px 24px -8px rgba(var(--lp-b), 0.6);
  transition:
    transform var(--dur) var(--ease-spring),
    box-shadow var(--dur) var(--ease-out);
}
.solid-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px -8px rgba(var(--lp-b), 0.8);
}

/* ---------- Hero ---------- */
.hero {
  position: relative;
  min-height: 92vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 80px 24px 60px;
}
.hero-content {
  position: relative;
  z-index: 2;
  max-width: 880px;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  margin-bottom: 28px;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--color-text-mid);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-full);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgb(var(--lp-a));
  box-shadow: 0 0 10px 1px rgb(var(--lp-a));
  animation: pulse 2.2s ease-in-out infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}
.hero-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2.6rem, 8vw, 5.4rem);
  line-height: 0.98;
  letter-spacing: -0.04em;
  margin: 0;
}
.hero-title .ln {
  display: block;
}
.hero-title .grad {
  background: linear-gradient(100deg, rgb(var(--lp-a)) 0%, rgb(var(--lp-b)) 55%, #f0abfc 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  background-size: 200% auto;
  animation: shimmer 6s linear infinite;
}
@keyframes shimmer {
  to {
    background-position: 200% center;
  }
}
.hero-sub {
  max-width: 620px;
  margin: 26px auto 0;
  font-size: clamp(1rem, 2.2vw, 1.2rem);
  line-height: 1.6;
  color: var(--color-text-mid);
}
.hero-cta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
  margin-top: 38px;
}
.cta-primary {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 26px;
  font-size: 15px;
  font-weight: 600;
  color: #0a0a0b;
  border-radius: var(--radius-lg);
  background: linear-gradient(120deg, rgb(var(--lp-a)), rgb(var(--lp-b)));
  box-shadow:
    0 0 0 1px rgba(var(--lp-a), 0.3),
    0 14px 40px -10px rgba(var(--lp-b), 0.7);
  transition:
    transform var(--dur) var(--ease-spring),
    box-shadow var(--dur) var(--ease-out);
}
.cta-primary:hover {
  transform: translateY(-3px);
  box-shadow:
    0 0 0 1px rgba(var(--lp-a), 0.5),
    0 20px 50px -10px rgba(var(--lp-b), 0.9);
}
.cta-primary .arr {
  transition: transform var(--dur) var(--ease-spring);
}
.cta-primary:hover .arr {
  transform: translateX(4px);
}
.cta-primary.big {
  padding: 17px 34px;
  font-size: 16.5px;
}
.cta-ghost {
  display: inline-flex;
  align-items: center;
  padding: 14px 24px;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-high);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-strong);
  background: rgba(255, 255, 255, 0.02);
  transition:
    border-color var(--dur) var(--ease-out),
    background var(--dur) var(--ease-out);
}
.cta-ghost:hover {
  border-color: rgba(var(--lp-a), 0.6);
  background: rgba(var(--lp-a), 0.08);
}
.hero-trust {
  margin-top: 30px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.04em;
  color: var(--color-text-disabled);
}
.scroll-hint {
  position: absolute;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  color: var(--color-text-muted);
  font-size: 22px;
  animation: bobHint 2s ease-in-out infinite;
}
@keyframes bobHint {
  0%,
  100% {
    transform: translate(-50%, 0);
    opacity: 0.6;
  }
  50% {
    transform: translate(-50%, 8px);
    opacity: 1;
  }
}

/* ---------- Marquee ---------- */
.marquee {
  position: relative;
  z-index: 2;
  overflow: hidden;
  display: flex;
  width: 100%;
  padding: 14px 0;
  border-top: 1px solid var(--color-border-subtle);
  border-bottom: 1px solid var(--color-border-subtle);
  background: linear-gradient(90deg, rgba(var(--lp-a), 0.04), rgba(var(--lp-b), 0.04)), rgba(255, 255, 255, 0.02);
  /* Soft fade only at the very edges so the ribbon reads as full-width. */
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
}
/* Two identical tracks scroll as one: as track A exits left, track B (flush
   after it) arrives — seamless at any viewport width. Each is its own content
   width and translates exactly -100% of itself. */
.marquee-track {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  width: max-content;
  animation: scrollX 38s linear infinite;
}
.mq-item {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  padding-right: 14px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: var(--color-text-mid);
}
.mq-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: linear-gradient(120deg, rgb(var(--lp-a)), rgb(var(--lp-b)));
  box-shadow: 0 0 8px 0 rgba(var(--lp-a), 0.7);
}
@keyframes scrollX {
  to {
    transform: translateX(-100%);
  }
}

/* ---------- Sections ---------- */
.section {
  position: relative;
  z-index: 2;
  max-width: 1180px;
  margin: 0 auto;
  padding: 96px 24px;
}
.sec-head {
  text-align: center;
  margin-bottom: 52px;
}
.kicker {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgb(var(--lp-a));
  margin-bottom: 14px;
}
.sec-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(1.8rem, 4.5vw, 2.8rem);
  letter-spacing: -0.03em;
  margin: 0;
}

/* ---------- Bento ---------- */
.bento {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}
.feat {
  position: relative;
  overflow: hidden;
  padding: 28px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-subtle);
  background: radial-gradient(120% 100% at 0% 0%, rgba(var(--glow), 0.08), transparent 55%), var(--color-surface-1);
  transform: perspective(900px) rotateX(var(--rx, 0)) rotateY(var(--ry, 0));
  transform-style: preserve-3d;
  transition:
    transform 0.2s var(--ease-out),
    border-color var(--dur) var(--ease-out),
    box-shadow var(--dur) var(--ease-out);
}
.feat:hover {
  border-color: rgba(var(--glow), 0.5);
  box-shadow: 0 24px 60px -24px rgba(var(--glow), 0.6);
}
.feat-shine {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(220px circle at var(--mx, 50%) var(--my, 0%), rgba(var(--glow), 0.16), transparent 60%);
  transition: opacity var(--dur) var(--ease-out);
  pointer-events: none;
}
.feat:hover .feat-shine {
  opacity: 1;
}
.feat-ic {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  color: rgb(var(--glow));
  background: rgba(var(--glow), 0.12);
  border: 1px solid rgba(var(--glow), 0.3);
  margin-bottom: 18px;
}
.feat-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-high);
  margin: 0 0 8px;
}
.feat-body {
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--color-text-mid);
  margin: 0;
}

/* ---------- Steps ---------- */
.steps {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
.steps-line {
  position: absolute;
  top: 28px;
  left: 16%;
  right: 16%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(var(--lp-a), 0.5), rgba(var(--lp-b), 0.5), transparent);
}
.step {
  position: relative;
  text-align: center;
  padding: 0 12px;
}
.step-badge {
  position: relative;
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  margin: 0 auto 20px;
  border-radius: 50%;
  color: rgb(var(--lp-a));
  background: var(--color-surface-1);
  border: 1px solid rgba(var(--lp-a), 0.4);
  box-shadow:
    0 0 0 6px rgba(10, 10, 11, 1),
    0 0 24px -4px rgba(var(--lp-a), 0.5);
}
.step-n {
  position: absolute;
  top: -8px;
  right: -8px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: #0a0a0b;
  background: rgb(var(--lp-a));
  padding: 2px 6px;
  border-radius: var(--radius-full);
}
.step-title {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  margin: 0 0 6px;
}
.step-body {
  font-size: 14px;
  line-height: 1.55;
  color: var(--color-text-mid);
  margin: 0;
}

/* ---------- Final CTA ---------- */
.final {
  position: relative;
  overflow: hidden;
  text-align: center;
  padding: 72px 32px;
  border-radius: var(--radius-2xl);
  border: 1px solid var(--color-border-subtle);
  background: radial-gradient(120% 120% at 50% 0%, rgba(var(--lp-b), 0.12), transparent 60%), var(--color-surface-1);
}
.final-aurora {
  position: absolute;
  width: 60%;
  height: 200%;
  left: 20%;
  top: -50%;
  background: radial-gradient(circle, rgba(var(--lp-a), 0.18), transparent 60%);
  filter: blur(60px);
  animation: drift1 16s ease-in-out infinite;
  pointer-events: none;
}
@keyframes drift1 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(8%, 6%);
  }
}
.final-title {
  position: relative;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(1.9rem, 5vw, 3rem);
  letter-spacing: -0.03em;
  margin: 12px 0 0;
}
.final-body {
  position: relative;
  max-width: 480px;
  margin: 14px auto 30px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--color-text-mid);
}
.final .cta-primary {
  position: relative;
}

/* ---------- Footer ---------- */
.lp-foot {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 24px 52px;
  border-top: 1px solid var(--color-border-subtle);
  text-align: center;
}
.lp-foot-brand {
  display: flex;
  align-items: center;
  gap: 9px;
}
.lp-foot-name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--color-text-high);
}
.lp-foot-copy {
  margin: 0;
  max-width: 460px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-muted);
}

/* ---------- Reveal animation ---------- */
[data-reveal] {
  opacity: 0;
  transform: translateY(26px);
  transition:
    opacity 0.7s var(--ease-out),
    transform 0.7s var(--ease-out);
  transition-delay: var(--d, 0ms);
}
[data-reveal].is-revealed {
  opacity: 1;
  transform: none;
}

/* ---------- Responsive ---------- */
@media (max-width: 860px) {
  .bento {
    grid-template-columns: 1fr;
  }
  .steps {
    grid-template-columns: 1fr;
    gap: 36px;
  }
  .steps-line {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .badge-dot,
  .hero-title .grad,
  .marquee-track,
  .scroll-hint,
  .final-aurora {
    animation: none;
  }
  .hero-title .grad {
    background-position: 0 center;
  }
  [data-reveal] {
    opacity: 1;
    transform: none;
    transition: none;
  }
  .feat {
    transform: none;
  }
}
</style>
