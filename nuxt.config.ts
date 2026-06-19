// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/fonts', 'nuxt-auth-utils'],

  // This is a client-side, localStorage-driven app (deck manager + proxy printer).
  // Disable SSR to avoid hydration mismatches from client-only persisted state.
  ssr: false,

  devtools: {
    enabled: true,
  },

  // Cinematic page transitions.
  app: {
    pageTransition: { name: 'cine', mode: 'out-in' },
  },

  css: ['~/assets/css/main.css'],

  // Register custom color names so app.config.ts aliases resolve.
  ui: {
    theme: {
      colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'cyan', 'magenta', 'ink'],
    },
  },

  // Light + dark both supported. Default follows the OS preference; the user can
  // override it via the sidebar toggle (persisted by @nuxtjs/color-mode).
  // classSuffix '' so the html class is `.light` / `.dark` (what Nuxt UI + our
  // token overrides key on).
  colorMode: {
    preference: 'system',
    fallback: 'dark',
    classSuffix: '',
  },

  // Persist the Nitro route cache (defineCachedEventHandler) to disk instead of
  // the default in-memory store. The cached Scryfall/EDHREC proxies hold data
  // that's stable for hours-to-days (a card's printings/images never change),
  // but an in-memory cache is wiped on every server restart — so every deploy
  // made the first deck-open slow again. A filesystem-backed cache survives
  // restarts (and is shared across all users), so the slow Scryfall cold-fetch
  // is paid once, ever, per key — not once per process lifetime.
  nitro: {
    storage: {
      cache: { driver: 'fs', base: './.data/cache' },
    },
    // Dev uses a separate storage layer; mount the same fs driver there so the
    // cache persists across `nuxt dev` restarts too (matches prod behaviour).
    devStorage: {
      cache: { driver: 'fs', base: './.data/cache' },
    },
  },

  compatibilityDate: '2025-01-15',

  // Self-host fonts (no render-blocking @import, works offline).
  // Geist (+ Geist Mono) is the new primary type system (modern-SaaS redesign);
  // Orbitron/Sora/JetBrains kept during the page-by-page migration.
  fonts: {
    families: [
      { name: 'Geist', provider: 'google', weights: [400, 500, 600, 700] },
      { name: 'Geist Mono', provider: 'google', weights: [400, 500] },
      { name: 'Orbitron', provider: 'google', weights: [600, 700, 800] },
      { name: 'Sora', provider: 'google', weights: [300, 400, 500, 600, 700] },
      { name: 'JetBrains Mono', provider: 'google', weights: [400, 500, 600] },
    ],
  },
})
