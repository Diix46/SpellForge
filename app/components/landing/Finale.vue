<script setup lang="ts">
import { libraryPath } from '#shared/game'

// The last word: both doors again, one on each side of the seam.
const { t } = useLocale()
</script>

<template>
  <section class="finale">
    <NuxtLink :to="libraryPath('optcg')" class="door door--op">
      <span class="door-kicker">{{ t('home.hero.opKicker') }}</span>
      <span class="door-title">{{ t('home.hero.opCta') }}</span>
      <UIcon name="i-lucide-arrow-right" class="door-arrow" />
    </NuxtLink>
    <div class="middle">
      <svg class="prism" viewBox="0 0 40 40" aria-hidden="true">
        <path d="M20 3 L20 37 L6 20 Z" fill="#c9312a" />
        <path d="M20 3 L34 20 L20 37 Z" fill="#c9a24e" />
        <path d="M20 3 L20 37" stroke="#fff8ec" stroke-width="1" opacity=".6" />
      </svg>
      <h2 class="title">
        {{ t('home.finale.title') }}
      </h2>
      <p class="sub">
        {{ t('home.finale.sub') }}
      </p>
    </div>
    <NuxtLink :to="libraryPath('mtg')" class="door door--mtg">
      <span class="door-kicker">{{ t('home.hero.mtgKicker') }}</span>
      <span class="door-title">{{ t('home.hero.mtgCta') }}</span>
      <UIcon name="i-lucide-arrow-right" class="door-arrow" />
    </NuxtLink>
  </section>
</template>

<style scoped>
.finale {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 420px;
}
.door {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 60px clamp(20px, 6vw, 110px);
  text-decoration: none;
  transition: background 0.6s ease;
}
.door:focus-visible {
  outline: 3px solid #f1d994;
  outline-offset: -8px;
}
.door-kicker {
  font-size: 12px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.door-title {
  font-size: clamp(36px, 3.8vw, 64px);
  line-height: 0.95;
  text-wrap: balance;
}
.door-arrow {
  width: 34px;
  height: 34px;
  transition: translate 0.4s cubic-bezier(0.3, 1.5, 0.5, 1);
}
.door--op {
  align-items: flex-start;
  padding-right: 190px;
  background: linear-gradient(180deg, #efdfc0, #e2cc9f);
  color: #231708;
}
.door--op:hover {
  background: linear-gradient(180deg, #f5e8cc, #e8d4ab);
}
.door--op .door-kicker {
  font-family: 'Bangers', 'Anton', Impact, sans-serif;
  font-size: 15px;
  letter-spacing: 0.1em;
  color: #a4231d;
}
.door--op .door-title {
  font-family: 'Anton', Impact, sans-serif;
  text-transform: uppercase;
  text-shadow: 0.045em 0.045em 0 #c9312a;
}
.door--op:hover .door-arrow {
  translate: 8px 0;
}
.door--mtg {
  align-items: flex-end;
  padding-left: 190px;
  background: linear-gradient(180deg, #0b0910, #07060b);
  color: #f3ecda;
  text-align: right;
}
.door--mtg:hover {
  background: linear-gradient(180deg, #120e1a, #0a0810);
}
.door--mtg .door-kicker {
  font-family: var(--mtg-face);
  font-weight: 700;
  color: #c9a24e;
}
.door--mtg .door-title {
  font-family: var(--mtg-face);
  font-weight: 700;
  background: linear-gradient(180deg, #fff3cf, #c9a24e);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.door--mtg .door-arrow {
  color: #c9a24e;
}
.door--mtg:hover .door-arrow {
  translate: 8px 0;
}
.middle {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 280px;
  padding: 40px 18px 22px;
  translate: -50% -50%;
  border: 1px solid transparent;
  border-radius: 10px;
  background:
    linear-gradient(#100d14, #100d14) padding-box,
    linear-gradient(90deg, #c9312a, #c9a24e) border-box;
  color: #f3ecda;
  text-align: center;
  box-shadow: 0 24px 50px -20px rgba(0, 0, 0, 0.85);
  pointer-events: none;
}
.prism {
  position: absolute;
  top: -28px;
  width: 56px;
  height: 56px;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.5));
}
.title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
}
.sub {
  margin: 0;
  color: #b9ac8e;
  font-size: 14px;
}
@media (max-width: 900px) {
  .finale {
    grid-template-columns: 1fr;
  }
  .door {
    padding: 50px 20px;
  }
  .door--op {
    padding-right: 20px;
    padding-bottom: 110px;
  }
  .door--mtg {
    padding-left: 20px;
    padding-top: 110px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .door,
  .door-arrow {
    transition: none;
  }
}
</style>
