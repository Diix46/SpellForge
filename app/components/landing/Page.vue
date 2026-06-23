<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuthOverlay } from '~/composables/useAuthOverlay'
import { useLocale } from '~/composables/useLocale'
import { useScrollReveal } from '~/composables/useScrollReveal'

// Marketing landing shown on "/" to signed-out visitors (the dashboard renders
// instead once logged in). The cinematic hero owns its own header + auth CTAs;
// this page adds the feature/steps/final sections below the fold.

const { t, locale } = useLocale()
const { show: openAuth } = useAuthOverlay()

const root = ref<HTMLElement | null>(null)
useScrollReveal(() => root.value)

// Real Magic cards for the "how it works" step mockups (Coach suggestions + the
// printed PDF sheet) so the demos show actual cards, not abstract placeholders.
interface DemoCard { name: string, image: string, art: string, colors: string[] }
const demoCards = ref<DemoCard[]>([])
const coachCards = ref<DemoCard[]>([])
onMounted(async () => {
  if (!import.meta.client)
    return
  try {
    const { cards } = await $fetch<{ cards: DemoCard[] }>('/api/landing/cards', { query: { lang: locale.value, _: Date.now() } })
    const pool = (cards ?? []).filter(c => c.image && c.art)
    demoCards.value = pool.slice(0, 9) // fills the 3×3 PDF sheet
    coachCards.value = pool.slice(9, 12) // 3 distinct cards for the Coach demo
  }
  catch {
    // graceful: the mockups fall back to placeholder tiles if the fetch fails
  }
})

const FEATURES = [
  { icon: 'i-lucide-wand-sparkles', key: 'f1', glow: '79,168,232' },
  { icon: 'i-lucide-printer', key: 'f2', glow: '56,184,131' },
  { icon: 'i-lucide-link', key: 'f3', glow: '168,85,247' },
  { icon: 'i-lucide-euro', key: 'f4', glow: '233,196,106' },
  { icon: 'i-lucide-shield-check', key: 'f5', glow: '232,88,68' },
  { icon: 'i-lucide-bar-chart-3', key: 'f6', glow: '79,168,232' },
] as const

const STEPS = [
  { n: '01', icon: 'i-lucide-square-plus', key: 's1', glow: '79,168,232' },
  { n: '02', icon: 'i-lucide-sparkles', key: 's2', glow: '168,85,247' },
  { n: '03', icon: 'i-lucide-printer', key: 's3', glow: '56,184,131' },
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
    <!-- ============ HERO: cinematic full-bleed card gallery ============ -->
    <LandingCinematicHero />

    <!-- ============ FEATURES (bento) ============ -->
    <section class="section">
      <div class="sec-head" data-reveal>
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
        <h2 class="sec-title">
          {{ t('landing.stepsTitle') }}
        </h2>
      </div>

      <div class="steps">
        <div class="steps-line" aria-hidden="true">
          <span class="steps-line-fill" />
        </div>
        <article
          v-for="(s, i) in STEPS"
          :key="s.key"
          class="step"
          data-reveal
          :style="{ '--glow': s.glow, '--d': `${i * 110}ms` }"
          @pointermove="onTilt"
          @pointerleave="resetTilt"
        >
          <div class="step-shine" />
          <span class="step-watermark" aria-hidden="true">{{ s.n }}</span>

          <header class="step-head">
            <span class="step-ic">
              <UIcon :name="s.icon" class="h-[18px] w-[18px]" />
            </span>
            <div class="step-text">
              <h3 class="step-title">
                {{ t(`landing.${s.key}Title`) }}
              </h3>
              <p class="step-body">
                {{ t(`landing.${s.key}Body`) }}
              </p>
            </div>
          </header>

          <!-- Mini illustration of what the step looks like in the app -->
          <div class="step-art" aria-hidden="true">
            <!-- 1) Import: an EDHREC URL field -->
            <div v-if="s.key === 's1'" class="art-card art-import">
              <div class="art-field">
                <UIcon name="i-lucide-link" class="art-field-ic" />
                <span class="art-url">edhrec.com/commanders/<b>atraxa</b></span>
              </div>
              <div class="art-import-btn">
                {{ t('modal.import') }}
              </div>
            </div>

            <!-- 2) Coach: real suggested cards (art thumb + name) with add/cut state -->
            <div v-else-if="s.key === 's2'" class="art-card art-coach">
              <div class="art-coach-head">
                <UIcon name="i-lucide-sparkles" class="art-coach-ic" />
                <span class="art-coach-label">{{ t('ai.toAdd') }}</span>
              </div>
              <div
                v-for="(c, ci) in coachCards"
                :key="c.name"
                class="art-sugg"
                :class="ci === 2 ? 'art-sugg--cut' : 'art-sugg--add'"
              >
                <span class="art-sugg-thumb">
                  <img :src="c.art" alt="" loading="lazy" decoding="async">
                </span>
                <span class="art-sugg-name">{{ c.name }}</span>
                <UIcon :name="ci === 2 ? 'i-lucide-scissors' : 'i-lucide-plus'" class="art-sugg-act" />
              </div>
              <!-- fallback skeleton while cards load -->
              <template v-if="!coachCards.length">
                <div v-for="n in 3" :key="n" class="art-sugg art-sugg--skel">
                  <span class="art-sugg-thumb" />
                  <span class="art-sugg-name art-skel-line" />
                </div>
              </template>
            </div>

            <!-- 3) Print: a real PDF sheet of actual card images with cut guides -->
            <div v-else class="art-card art-print">
              <div class="art-sheet">
                <span v-for="n in 9" :key="n" class="art-mini-card">
                  <img v-if="demoCards[n - 1]" :src="demoCards[n - 1]?.image" alt="" loading="lazy" decoding="async">
                </span>
                <span class="art-cut art-cut--v1" />
                <span class="art-cut art-cut--v2" />
                <span class="art-cut art-cut--h1" />
                <span class="art-cut art-cut--h2" />
              </div>
              <span class="art-print-tag">PDF · A4</span>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- ============ FINAL CTA ============ -->
    <section class="section">
      <div class="final" data-reveal>
        <div class="final-aurora" aria-hidden="true" />
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
        <AppLogo :wordmark="false" :size="18" />
        <span class="lp-foot-name">Spellforge</span>
      </div>
      <span class="lp-foot-sep" aria-hidden="true">·</span>
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
  /* Flex column so the footer is pushed to the bottom of the viewport even when
     the content is short — no "footer floating mid-page" gap. */
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--color-bg-base);
  color: var(--color-text-high);
  overflow-x: hidden;
}

/* ---------- Shared CTA (hero owns its own; reused by the final section) ---------- */
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
/* ---------- Sections ---------- */
.section {
  position: relative;
  z-index: 2;
  max-width: 1180px;
  margin: 0 auto;
  padding: 64px 24px;
}
.sec-head {
  text-align: center;
  margin-bottom: 52px;
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

/* ---------- Steps (premium glass cards) ---------- */
.steps {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
/* Luminous connector running behind the cards, with an animated fill */
.steps-line {
  position: absolute;
  top: 50px;
  left: 12%;
  right: 12%;
  height: 2px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}
.steps-line-fill {
  position: absolute;
  inset: 0;
  transform-origin: left center;
  background: linear-gradient(90deg, rgb(79, 168, 232), rgb(168, 85, 247), rgb(56, 184, 131));
  box-shadow: 0 0 16px -2px rgba(168, 85, 247, 0.7);
  animation: lineGrow 1.4s 0.25s var(--ease-out) both;
}
@keyframes lineGrow {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
.step {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 26px 22px 22px;
  border-radius: var(--radius-2xl);
  border: 1px solid var(--color-border-subtle);
  background: radial-gradient(120% 90% at 50% 0%, rgba(var(--glow), 0.1), transparent 60%), var(--color-surface-1);
  transform: perspective(1000px) rotateX(var(--rx, 0)) rotateY(var(--ry, 0));
  transform-style: preserve-3d;
  transition:
    transform 0.2s var(--ease-out),
    border-color var(--dur) var(--ease-out),
    box-shadow var(--dur) var(--ease-out);
}
.step:hover {
  border-color: rgba(var(--glow), 0.5);
  box-shadow: 0 28px 70px -28px rgba(var(--glow), 0.6);
}
.step-shine {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  background: radial-gradient(260px circle at var(--mx, 50%) var(--my, 0%), rgba(var(--glow), 0.16), transparent 60%);
  transition: opacity var(--dur) var(--ease-out);
}
.step:hover .step-shine {
  opacity: 1;
}
.step-watermark {
  position: absolute;
  top: -18px;
  right: 4px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 120px;
  line-height: 1;
  letter-spacing: -0.04em;
  color: rgba(var(--glow), 0.1);
  pointer-events: none;
  user-select: none;
}
.step-head {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 20px;
}
.step-ic {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-lg);
  color: rgb(var(--glow));
  background: rgba(var(--glow), 0.12);
  border: 1px solid rgba(var(--glow), 0.3);
}
.step-text {
  min-width: 0;
}
.step-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-high);
  margin: 0 0 5px;
}
.step-body {
  font-size: 14px;
  line-height: 1.55;
  color: var(--color-text-mid);
  margin: 0;
}

/* ---------- Step mini-mockups (real little UI illustrations, inside the card) ---------- */
.step-art {
  margin-top: auto; /* pin the mockup to the bottom so cards align */
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 168px;
}
.art-card {
  width: 100%;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-subtle);
  background: var(--color-bg-base);
  padding: 16px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
/* 1) Import field */
.art-import {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.art-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-strong);
  background: var(--color-bg-base);
}
.art-field-ic {
  width: 15px;
  height: 15px;
  color: rgb(var(--lp-b));
  flex-shrink: 0;
}
.art-url {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.art-url b {
  color: var(--color-text-high);
  font-weight: 600;
}
.art-import-btn {
  align-self: flex-end;
  font-size: 12.5px;
  font-weight: 600;
  color: #0a0a0b;
  padding: 7px 16px;
  border-radius: var(--radius-md);
  background: linear-gradient(120deg, rgb(var(--lp-a)), rgb(var(--lp-b)));
}
/* 2) Coach suggestions — real cards (art thumbnail + name + add/cut state) */
.art-coach {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.art-coach-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 2px;
}
.art-coach-ic {
  width: 15px;
  height: 15px;
  color: rgb(var(--glow));
}
.art-coach-label {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.art-sugg {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 5px 9px 5px 5px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-subtle);
  background: var(--color-surface-1);
}
.art-sugg-thumb {
  flex-shrink: 0;
  width: 40px;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--color-surface-3);
}
.art-sugg-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.art-sugg-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-text-high);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.art-sugg-act {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
}
.art-sugg--add {
  border-color: rgba(56, 184, 131, 0.32);
}
.art-sugg--add .art-sugg-act {
  color: rgb(56, 184, 131);
}
.art-sugg--cut {
  border-color: rgba(232, 88, 68, 0.3);
}
.art-sugg--cut .art-sugg-name {
  color: var(--color-text-muted);
  text-decoration: line-through;
}
.art-sugg--cut .art-sugg-act {
  color: rgb(232, 120, 100);
}
.art-sugg--skel .art-sugg-thumb,
.art-skel-line {
  background: linear-gradient(90deg, var(--color-surface-2), var(--color-surface-3), var(--color-surface-2));
  background-size: 200% 100%;
  animation: skelShimmer 1.4s ease-in-out infinite;
}
.art-skel-line {
  height: 11px;
  border-radius: 4px;
}
@keyframes skelShimmer {
  to {
    background-position: -200% 0;
  }
}
/* 3) PDF print sheet with cut guides */
.art-print {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.art-sheet {
  position: relative;
  width: 150px;
  height: 196px;
  background: #f4f1ea;
  border-radius: 3px;
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 7px;
}
.art-mini-card {
  position: relative;
  border-radius: 2px;
  overflow: hidden;
  background: linear-gradient(140deg, #2a2c3a, #3c3550);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
}
.art-mini-card img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* show the top (art) of each card so the sheet reads as real cards */
  object-position: top center;
}
.art-cut {
  position: absolute;
  background: repeating-linear-gradient(to var(--dir, right), rgba(10, 10, 11, 0.55) 0 4px, transparent 4px 8px);
}
.art-cut--v1,
.art-cut--v2 {
  top: 0;
  bottom: 0;
  width: 1px;
  --dir: bottom;
}
.art-cut--v1 {
  left: 33.5%;
}
.art-cut--v2 {
  left: 66.5%;
}
.art-cut--h1,
.art-cut--h2 {
  left: 0;
  right: 0;
  height: 1px;
  --dir: right;
}
.art-cut--h1 {
  top: 33.5%;
}
.art-cut--h2 {
  top: 66.5%;
}
.art-print-tag {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

/* ---------- Final CTA ---------- */
.final {
  position: relative;
  overflow: hidden;
  text-align: center;
  padding: 52px 32px;
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
  margin-top: auto; /* pin to the viewport bottom when content is short */
  display: flex;
  flex-wrap: wrap; /* drops to a 2nd line only on very narrow screens */
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-top: 1px solid var(--color-border-subtle);
  text-align: center;
}
.lp-foot-brand {
  display: flex;
  align-items: center;
  gap: 7px;
}
.lp-foot-name {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--color-text-high);
}
.lp-foot-sep {
  color: var(--color-text-disabled);
}
.lp-foot-copy {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
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
  .final-aurora {
    animation: none;
  }
  [data-reveal] {
    opacity: 1;
    transform: none;
    transition: none;
  }
  .feat,
  .step {
    transform: none;
  }
  .steps-line-fill {
    animation: none;
    transform: scaleX(1);
  }
}
</style>
