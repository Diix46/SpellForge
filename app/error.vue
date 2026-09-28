<script setup lang="ts">
import type { NuxtError } from '#app'
import { computed } from 'vue'
import { GAME_LIST, libraryPath } from '#shared/game'
import { lookVars, WORLD_LOOK } from '~/utils/landing/looks'

// A page that doesn't exist, or a page that broke: said plainly in the site's
// language, in the app's own frame, with the way back and a door to each
// world's library.
const props = defineProps<{ error: NuxtError }>()
const { t } = useLocale()

const missing = computed(() => props.error.statusCode === 404)
useHead({ title: () => `${missing.value ? t('error.missingTitle') : t('error.brokenTitle')} · Prism` })

// The page stands outside app.vue: it brings the same top bar, footer and
// sign-in dialog.
const { open: showAuth } = useAuthOverlay()

function home() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <UApp>
    <FxAppBackground />
    <div class="app-shell">
      <AppHeader />
      <main id="content" class="content">
        <ErrorPanel
          :code="error.statusCode"
          heading="h1"
          :title="missing ? t('error.missingTitle') : t('error.brokenTitle')"
          :body="missing ? t('error.missingBody') : t('error.brokenBody')"
        >
          <template #actions>
            <UButton size="lg" color="primary" icon="i-lucide-arrow-left" @click="home">
              {{ t('error.home') }}
            </UButton>
          </template>
          <nav class="doors" :aria-label="t('home.gallery.kicker')">
            <a
              v-for="g in GAME_LIST"
              :key="g.id"
              :href="libraryPath(g.id)"
              class="door"
              :data-world="g.id" :style="{ ...lookVars(g.id), '--swatch': g.swatch }"
            >
              <span class="door-name" :class="{ upper: WORLD_LOOK[g.id].upper }">{{ g.label }}</span>
              <UIcon name="i-lucide-arrow-right" class="h-4 w-4" />
            </a>
          </nav>
        </ErrorPanel>
      </main>
      <AppFooter />
    </div>
    <AuthModal v-model:open="showAuth" />
  </UApp>
</template>

<style scoped>
.app-shell {
  position: relative;
  z-index: var(--z-content);
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
.content {
  display: flex;
  flex: 1;
  align-items: center;
  width: 100%;
  max-width: var(--shell-max);
  margin: 0 auto;
  padding: var(--space-3) var(--gutter) var(--space-5);
}
.doors {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-1);
  max-width: 900px;
  margin-top: var(--space-3);
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
  border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
  transition: border-color var(--dur) var(--ease-out);
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
.door:hover {
  border-color: var(--swatch);
}
</style>
