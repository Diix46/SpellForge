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

  compatibilityDate: '2025-01-15',

  // Self-host fonts (no render-blocking @import, works offline).
  fonts: {
    families: [
      { name: 'Orbitron', provider: 'google', weights: [600, 700, 800] },
      { name: 'Sora', provider: 'google', weights: [300, 400, 500, 600, 700] },
      { name: 'JetBrains Mono', provider: 'google', weights: [400, 500, 600] },
    ],
  },
})
