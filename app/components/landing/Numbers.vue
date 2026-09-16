<script setup lang="ts">
import type { LandingOverview } from '#shared/landing'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'

// The real figures of both databases, on the seam: One Piece on paper, Magic
// on obsidian, and the one number both share in the middle. They count up
// once, the first time they come into view; the server renders the final
// values.
const props = defineProps<{ stats: LandingOverview['stats'] }>()

const { t, locale } = useLocale()
const root = useTemplateRef<HTMLElement>('root')
const progress = ref(1)

const fmt = (n: number) => Math.round(n * progress.value).toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US')
const op = computed(() => [
  { id: 'op-cards', value: fmt(props.stats.optcgCards), label: t('home.numbers.opCards') },
  { id: 'op-arts', value: fmt(props.stats.optcgArts), label: t('home.numbers.opArts') },
])
const mtg = computed(() => [
  { id: 'mtg-cards', value: fmt(props.stats.mtgCards), label: t('home.numbers.mtgCards') },
])

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
    <div class="half half--op">
      <div v-for="n in op" :key="n.id" class="figure">
        <strong>{{ n.value }}</strong>
        <span>{{ n.label }}</span>
      </div>
    </div>
    <div class="zero">
      <strong>0</strong>
      <span>{{ t('home.numbers.account') }}</span>
    </div>
    <div class="half half--mtg">
      <div v-for="n in mtg" :key="n.id" class="figure">
        <strong>{{ n.value }}</strong>
        <span>{{ n.label }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.numbers {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  background: linear-gradient(90deg, #e6d2aa 50%, #0c0a12 50%);
  border-block: 1px solid rgba(212, 175, 95, 0.25);
}
.half {
  display: flex;
  flex-wrap: wrap;
  gap: 18px 44px;
  padding: 44px clamp(20px, 5vw, 80px);
}
.half--op {
  justify-content: flex-end;
  color: #231708;
}
.half--mtg {
  justify-content: flex-start;
  color: #f3ecda;
}
.figure {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 220px;
}
.figure strong {
  font-size: clamp(40px, 4.4vw, 64px);
  font-weight: 400;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.half--op strong {
  font-family: 'Anton', Impact, sans-serif;
  color: #231708;
}
.half--mtg strong {
  font-family: 'Cinzel', ui-serif, Georgia, serif;
  font-weight: 700;
  background: linear-gradient(180deg, #fff3cf, #c9a24e);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.figure span {
  font-size: 13px;
  line-height: 1.35;
}
.half--op span {
  color: #5a4228;
}
.half--mtg span {
  color: #b9ac8e;
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
    linear-gradient(#100d14, #100d14) padding-box,
    linear-gradient(90deg, #c9312a, #d4af5f) border-box;
  color: #f3ecda;
  text-align: center;
  box-shadow: 0 16px 40px -18px rgba(0, 0, 0, 0.8);
}
.zero strong {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 58px;
  font-weight: 400;
  line-height: 1;
  background: linear-gradient(90deg, #ef6b5d, #f1d994);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.zero span {
  font-size: 12px;
  letter-spacing: 0.06em;
  color: #d6cbb1;
}
@media (max-width: 900px) {
  .numbers {
    grid-template-columns: 1fr;
    background: none;
  }
  .half {
    justify-content: center;
    padding: 28px 20px;
    text-align: center;
  }
  .half--op {
    background: #e6d2aa;
  }
  .half--mtg {
    background: #0c0a12;
  }
  .figure {
    align-items: center;
  }
  .zero {
    position: relative;
    z-index: 1;
    justify-self: center;
    margin: -20px 0;
  }
}
</style>
