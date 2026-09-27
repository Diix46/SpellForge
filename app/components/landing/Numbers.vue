<script setup lang="ts">
import type { LandingOverview, LandingWorld } from '#shared/landing'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { GAMES } from '#shared/game'

// The real figures of every card database, each in its world's colour, and
// the one number they all share: no account to start. They count up once,
// the first time they come into view; the server renders the final values.
const props = defineProps<{ stats: LandingOverview['stats'], worlds: LandingWorld[] }>()

const { t, locale } = useLocale()
const root = useTemplateRef<HTMLElement>('root')
const progress = ref(1)

const fmt = (n: number) => Math.round(n * progress.value).toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US')
const figures = computed(() => props.worlds.filter(w => w.cards > 0).map(w => ({
  id: w.game,
  value: fmt(w.cards),
  label: t('home.numbers.cardsOf').replace('{game}', GAMES[w.game].label),
  swatch: GAMES[w.game].swatch,
})))

let observer: IntersectionObserver | null = null
let raf = 0
onMounted(() => {
  if (!root.value || matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting)
      return
    observer?.disconnect()
    const t0 = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 1100)
      progress.value = 1 - (1 - k) ** 3
      if (k < 1)
        raf = requestAnimationFrame(step)
    }
    progress.value = 0
    raf = requestAnimationFrame(step)
  }, { threshold: 0.4 })
  observer.observe(root.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(raf)
})
</script>

<template>
  <section id="numbers" ref="root" class="numbers">
    <div class="figures">
      <div v-for="n in figures" :key="n.id" class="figure" :style="{ '--swatch': n.swatch }">
        <strong>{{ n.value }}</strong>
        <span>{{ n.label }}</span>
      </div>
    </div>
    <div class="zero">
      <strong>0</strong>
      <span>{{ t('home.numbers.account') }}</span>
    </div>
  </section>
</template>

<style scoped>
.numbers {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 24px 48px;
  padding: 44px clamp(16px, 5vw, 80px);
  background: var(--l-bg-2);
  border-block: 1px solid var(--l-line);
}
.figures {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 18px 40px;
}
.figure {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}
.figure strong {
  font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(32px, 3.6vw, 52px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--swatch) 78%, var(--l-ink));
}
.figure span {
  font-size: 13px;
  line-height: 1.35;
  color: var(--l-muted);
}
.zero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 170px;
  padding: 16px 22px;
  border: 1px solid transparent;
  border-radius: 10px;
  background:
    linear-gradient(var(--l-panel), var(--l-panel)) padding-box,
    linear-gradient(90deg, #c9312a, #e3b22b, #6b3fa0, #1f8a9a, #2d4f7c) border-box;
  color: var(--l-ink);
  text-align: center;
  box-shadow: 0 16px 40px -18px rgba(0, 0, 0, 0.6);
}
.zero strong {
  font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
  font-size: 58px;
  font-weight: 700;
  line-height: 1;
  background: linear-gradient(90deg, #ef6b5d, #6b3fa0, #2d4f7c);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.zero span {
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--l-mid);
}
@media (max-width: 700px) {
  .figure {
    align-items: center;
    text-align: center;
  }
}
</style>
