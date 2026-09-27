<script setup lang="ts">
// Build, keep, share: a real sequence, so the steps are ordered along a line
// of the prism's light, the same in every world.
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
  padding: var(--l-section) var(--l-gutter);
  background: #09090d;
  color: #f6f4ee;
}
.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--l-head-gap);
  text-align: center;
}
.kicker {
  margin: 0;
  color: rgba(246, 244, 238, 0.6);
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}
.title {
  margin: 0;
  font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(34px, 4.6vw, 58px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
}
.steps {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 28px;
  max-width: var(--l-width);
  margin: 0 auto;
  padding: 0;
  list-style: none;
}
/* The prism's light, spread from the first step to the last. */
.steps::before {
  content: '';
  position: absolute;
  top: 27px;
  right: 16%;
  left: 16%;
  height: 2px;
  background: linear-gradient(90deg, #c9312a, #e3b22b, #6b3fa0, #1f8a9a, #2d4f7c);
  box-shadow: 0 0 14px rgba(255, 255, 255, 0.25);
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
  --ring: #c9312a;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-bottom: 8px;
  border: 2px solid var(--ring);
  border-radius: 50%;
  background: #09090d;
  color: #f6f4ee;
  box-shadow: 0 0 22px -4px var(--ring);
}
.step--1 .dot {
  --ring: #6b3fa0;
}
.step--2 .dot {
  --ring: #2d7fa8;
}
.step h3 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}
.step p {
  max-width: 32ch;
  margin: 0;
  color: rgba(246, 244, 238, 0.72);
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
    background: linear-gradient(180deg, #c9312a, #e3b22b, #6b3fa0, #1f8a9a, #2d4f7c);
    opacity: 0.4;
  }
  .step {
    padding: 0 8px 8px;
    background: #09090d;
  }
}
</style>
