<script setup lang="ts">
import type { NuxtError } from '#app'
import { computed } from 'vue'
import { GAME_LIST, libraryPath } from '#shared/game'
import { lookVars, WORLD_LOOK } from '~/utils/landing/looks'

// A page that doesn't exist, or a page that broke: said plainly in the site's
// language, with the way back and a door to each world's library.
const props = defineProps<{ error: NuxtError }>()
const { t } = useLocale()

const missing = computed(() => props.error.statusCode === 404)
useHead({ title: () => `${missing.value ? t('error.missingTitle') : t('error.brokenTitle')} · Prism` })

function home() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <main class="err">
    <NuxtLink to="/" class="brand" @click.prevent="home">
      <AppLogo />
    </NuxtLink>
    <p class="code">
      {{ error.statusCode }}
    </p>
    <h1 class="title">
      {{ missing ? t('error.missingTitle') : t('error.brokenTitle') }}
    </h1>
    <p class="sub">
      {{ missing ? t('error.missingBody') : t('error.brokenBody') }}
    </p>
    <button type="button" class="home" @click="home">
      <UIcon name="i-lucide-arrow-left" class="h-4 w-4" />
      {{ t('error.home') }}
    </button>
    <nav class="doors" :aria-label="t('home.gallery.kicker')">
      <a
        v-for="g in GAME_LIST"
        :key="g.id"
        :href="libraryPath(g.id)"
        class="door"
        :style="{ ...lookVars(g.id), '--swatch': g.swatch }"
      >
        <span class="door-name" :class="{ upper: WORLD_LOOK[g.id].upper }">{{ g.label }}</span>
        <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
      </a>
    </nav>
  </main>
</template>

<style scoped>
.err {
  /* Night in both modes: the logo's word reads light. */
  --color-text-high: #f6f4ee;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 100svh;
  padding: 48px 16px;
  background: radial-gradient(50% 40% at 50% 0%, rgba(255, 255, 255, 0.07), transparent 70%), #09090d;
  color: #f6f4ee;
  text-align: center;
}
.brand {
  margin-bottom: 20px;
  color: #f6f4ee;
  text-decoration: none;
}
.code {
  margin: 0;
  font-family: 'Anton', Impact, sans-serif;
  font-size: clamp(88px, 16vw, 160px);
  line-height: 0.9;
  background: linear-gradient(90deg, #ef5a4c, #6f9fe0, #f0c43a, #9a6ad8, #2fb3c4);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.title {
  margin: 0;
  font-size: clamp(24px, 3vw, 34px);
  font-weight: 700;
}
.sub {
  max-width: 46ch;
  margin: 0;
  color: rgba(246, 244, 238, 0.72);
  line-height: 1.55;
}
.home {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 28px;
  padding: 11px 20px;
  border-radius: 999px;
  background: #f6f4ee;
  color: #09090d;
  font-weight: 600;
  cursor: pointer;
}
.home:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 3px;
}
.doors {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  max-width: 900px;
}
.door {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--bg);
  color: var(--ink);
  text-decoration: none;
  box-shadow: inset 0 3px 0 var(--swatch);
  transition: transform 0.25s ease;
}
.door:hover {
  transform: translateY(-2px);
}
.door:focus-visible {
  outline: 2px solid var(--swatch);
  outline-offset: 3px;
}
.door .iconify {
  color: var(--accent);
}
.door-name {
  font-family: var(--face);
  font-size: 18px;
  font-weight: var(--weight);
}
.door-name.upper {
  text-transform: uppercase;
}
</style>
