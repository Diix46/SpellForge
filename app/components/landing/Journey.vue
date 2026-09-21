<script setup lang="ts">
// Build, keep, share: a real sequence, so the steps are ordered along a line
// that crosses the seam, starting by day and ending by night.
const { t } = useLocale()

const STEPS = [
  { id: 's1', icon: 'i-lucide-hammer' },
  { id: 's2', icon: 'i-lucide-cloud-upload' },
  { id: 's3', icon: 'i-lucide-share-2' },
] as const
</script>

<template>
  <section class="journey">
    <header class="head">
      <p class="kicker">
        {{ t('home.journey.kicker') }}
      </p>
      <h2 class="title">
        {{ t('home.journey.title') }}
      </h2>
    </header>
    <ol class="steps">
      <li v-for="(s, i) in STEPS" :key="s.id" class="step" :class="`step--${i}`">
        <span class="dot" aria-hidden="true"><UIcon :name="s.icon" class="h-5 w-5" /></span>
        <h3>{{ t(`home.journey.${s.id}t`) }}</h3>
        <p>{{ t(`home.journey.${s.id}b`) }}</p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.journey {
  padding: 100px clamp(20px, 5vw, 88px) 110px;
  background: linear-gradient(90deg, #f3e6cc 0%, #f2f0ec 50%, #eef0ee 100%);
  color: #1b1f22;
}
.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-bottom: 56px;
  text-align: center;
}
.kicker {
  margin: 0;
  color: #2d4f7c;
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}
.title {
  margin: 0;
  font-family: 'Anton', Impact, sans-serif;
  font-size: clamp(36px, 4.6vw, 64px);
  font-weight: 400;
  text-transform: uppercase;
  background: linear-gradient(90deg, #c9312a 0%, #6b6f72 50%, #2d4f7c 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.steps {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 28px;
  max-width: 1180px;
  margin: 0 auto;
  padding: 0;
  list-style: none;
}
.steps::before {
  content: '';
  position: absolute;
  top: 27px;
  right: 16%;
  left: 16%;
  height: 2px;
  background: linear-gradient(90deg, #c9312a, #2d4f7c, #2d4f7c);
  opacity: 0.7;
}
.step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  text-align: center;
}
.dot {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-bottom: 8px;
  border-radius: 50%;
}
.step--0 .dot {
  border: 2px solid #231708;
  background: #c9312a;
  color: #fff8ec;
  box-shadow: 3px 3px 0 #231708;
}
.step--1 .dot {
  border: 2px solid transparent;
  background:
    linear-gradient(#ffffff, #ffffff) padding-box,
    linear-gradient(135deg, #c9312a, #2d4f7c) border-box;
  color: #2d4f7c;
}
.step--2 .dot {
  border: 1px solid #2d4f7c;
  background: #eceeea;
  color: #2d4f7c;
  box-shadow: 0 6px 16px -10px rgba(45, 79, 124, 0.6);
}
.step h3 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}
.step--0 h3 {
  font-family: 'Anton', Impact, sans-serif;
  font-weight: 400;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.step--2 h3 {
  font-family: var(--mtg-face);
}
.step p {
  max-width: 32ch;
  margin: 0;
  color: #454d52;
  font-size: 15px;
  line-height: 1.55;
}
@media (max-width: 800px) {
  .steps {
    grid-template-columns: 1fr;
    gap: 36px;
  }
  .steps::before {
    top: 28px;
    bottom: 28px;
    left: 50%;
    right: auto;
    width: 2px;
    height: auto;
    opacity: 0.25;
  }
  .step {
    background: #16111a;
    padding: 0 8px 8px;
  }
}
</style>
