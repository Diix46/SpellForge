<script setup lang="ts">
import type { GameId } from '#shared/game'
import { computed, onMounted, watch } from 'vue'
import { GAME_LIST } from '#shared/game'
import { parseLocale } from '~/composables/useLocale'
import { applyUniverseMode, forcedModeOf } from '~/utils/universeMode'

// The Prism favicon as an inline SVG data URI (matches AppLogo): the red and
// gold facets on a dark tile, readable on light and dark tab bars alike.
const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">`
  + `<defs>`
  + `<linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EF6B5D"/><stop offset="1" stop-color="#B42A23"/></linearGradient>`
  + `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1D994"/><stop offset="1" stop-color="#B8903F"/></linearGradient>`
  + `</defs>`
  + `<rect width="40" height="40" rx="9" fill="#100D14"/>`
  + `<path d="M20 6 L20 34 L9 20 Z" fill="url(#r)"/>`
  + `<path d="M20 6 L31 20 L20 34 Z" fill="url(#g)"/>`
  + `<path d="M20 6 L20 34" stroke="#FFF8EC" stroke-width="1" opacity=".55"/>`
  + `</svg>`,
)}`

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
  ],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: FAVICON },
  ],
})

const route = useRoute()
const { universe } = useUniverse()
// The new universe comes in with the new page, once the old one has left (plugins/universe.ts).
const router = useRouter()
const { $showPage } = useNuxtApp()
const pageTransition = computed(() => router.currentRoute.value.meta.pageTransition === false ? false : { onBeforeEnter: $showPage })
const { locale, setLocale, t } = useLocale()

// A link can ask for a language (?lang=en): the hreflang alternates of the
// public pages point there. The choice is kept, so it is written even when the
// server already rendered the page in that language.
watch(() => route.query.lang, (lang) => {
  const l = parseLocale(lang)
  if (l)
    setLocale(l)
}, { immediate: true })

// Pages give their own title; the brand closes it. The home title is the
// brand line itself.
useSeoMeta({
  title: () => t('brand.title'),
  titleTemplate: (titleChunk?: string) =>
    titleChunk && titleChunk !== t('brand.title') ? `${titleChunk} · Prism` : t('brand.title'),
  description: () => t('brand.description'),
  ogSiteName: 'Prism',
})

// Light/dark — `preference` is what the user picked (system | light | dark);
// `value` is the resolved mode. The toggle flips between explicit light/dark.
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
// Yu-Gi-Oh and Riftbound are always at night (utils/universeMode): the page
// wears that mode, the switch keeps the visitor's choice for the other worlds.
const forcedMode = computed(() => forcedModeOf(universe.value))
onMounted(() => watch([universe, isDark], ([u, dark]) => applyUniverseMode(u, dark), { immediate: true }))
// Browser chrome (mobile address bar) follows the active theme. The document
// language follows the site locale (reactive — switches with the FR/EN toggle).
// The universe re-themes the whole document (assets/css/universes.css).
const THEME_COLOR = {
  light: Object.fromEntries(GAME_LIST.map(g => [g.id, g.themeColor.light])) as Record<GameId, string>,
  dark: Object.fromEntries(GAME_LIST.map(g => [g.id, g.themeColor.dark])) as Record<GameId, string>,
}
useHead({
  htmlAttrs: {
    'lang': () => locale.value,
    'data-universe': () => universe.value ?? undefined,
  },
  meta: [{
    name: 'theme-color',
    content: () => (universe.value ? THEME_COLOR[(forcedMode.value ?? (isDark.value ? 'dark' : 'light'))][universe.value] : isDark.value ? '#0a0a0b' : '#fafafa'),
  }],
})

// Auth modal is driven by shared overlay state so the (chrome-less) landing page
// can open it too. `showAuth` is the v-model the AuthModal binds to.
const { open: showAuth } = useAuthOverlay()

// One top bar and one footer everywhere (AppHeader, AppFooter). The home
// page spans the whole width; every other page gets the app's frame.
// The page on screen, not the route: the old page keeps its frame while it
// leaves (plugins/universe.ts).
const isHome = useState<boolean>('page-home', () => route.path === '/')

// A page can request a viewport-locked shell (no page scroll; the page fills the
// area below the top bar and manages its own internal scroll). The deck page
// uses this so the whole workspace + footer fit on one screen.
const appFullscreen = useState('app-fullscreen', () => false)
</script>

<template>
  <UApp>
    <FxOnePieceSea v-if="universe === 'optcg'" />
    <FxMagicTable v-else-if="universe === 'mtg'" />
    <FxPokemonMeadow v-else-if="universe === 'pokemon'" />
    <FxYugiohField v-else-if="universe === 'yugioh'" />
    <FxRiftboundSplash v-else-if="universe === 'riftbound'" />
    <!-- The home page paints its own ground over it: no hidden animation there. -->
    <FxAppBackground v-else-if="!isHome" />

    <NuxtLoadingIndicator :height="2" color="rgb(var(--accent-rgb))" />

    <div class="app-shell" :class="{ 'app-shell--fullscreen': appFullscreen, 'app-shell--bare': isHome }" :style="{ zIndex: 'var(--z-content)' }">
      <a href="#content" class="sr-only">Aller au contenu</a>
      <AppHeader />

      <!-- ============ MAIN ============ -->
      <main id="content" class="content">
        <NuxtPage :transition="pageTransition" />
      </main>

      <AppFooter :compact="appFullscreen" />
    </div>

    <AuthModal v-model:open="showAuth" />
    <DeckIoModal />
    <CommandPalette />
  </UApp>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
/* The home page: under the top bar, the content area carries everything
   full-bleed (its own footer included). Override the content frame (max-width
   1720 + padding + auto margins) so it spans edge to edge on any width. */
.app-shell--bare .content {
  flex: 1;
  max-width: none;
  margin: 0;
  padding: 0;
}
/* Viewport-locked mode (deck page): the whole shell is exactly one screen — the
   page fills the space below the top bar and scrolls internally, the footer
   stays pinned at the bottom, and there's no page scroll. */
.app-shell--fullscreen {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}
.app-shell--fullscreen .content {
  min-height: 0;
  overflow: hidden;
  padding-bottom: 16px;
}
/* On small screens the deck workspace stacks and needs natural page flow — don't
   trap it in a locked viewport. */
@media (max-width: 1023px) {
  .app-shell--fullscreen {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }
  .app-shell--fullscreen .content {
    overflow: visible;
  }
}

/* ---------- Main ---------- */
.content {
  flex: 1;
  width: 100%;
  max-width: var(--shell-max);
  margin: 0 auto;
  padding: var(--space-3) var(--gutter) var(--space-5);
}
</style>
