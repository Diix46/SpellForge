// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/fonts', 'nuxt-auth-utils'],

  // Hybrid rendering. The workshop (dashboard, deck pages) lives in the
  // browser: decks are in localStorage for guests, so the server has nothing to
  // render there. The public, indexable pages (libraries, card pages, Discover,
  // shared decks, the landing) are rendered on the server. See routeRules.
  ssr: true,

  routeRules: {
    '/**': { ssr: false },
    '/': { ssr: true },
    '/landing': { redirect: { to: '/', statusCode: 301 } },
    '/discover': { ssr: true },
    '/magic': { ssr: true },
    '/magic/card/**': { ssr: true },
    '/magic/shared/**': { ssr: true },
    '/one-piece': { ssr: true },
    '/one-piece/card/**': { ssr: true },
    '/one-piece/shared/**': { ssr: true },
  },

  // The public address, for canonical links and the sitemap
  // (NUXT_PUBLIC_SITE_URL). Empty: the address of the request.
  runtimeConfig: {
    public: { siteUrl: '' },
  },

  devtools: {
    enabled: true,
  },

  // Cinematic page transitions.
  app: {
    pageTransition: { name: 'cine', mode: 'out-in' },
    // What the browser-rendered pages carry before the app starts; pages then
    // set their own.
    head: {
      title: 'Prism, l\'atelier de decks One Piece et Magic',
      meta: [
        { name: 'description', content: 'Construisez vos decks One Piece et Magic sans créer de compte : toutes les cartes en local, règles vérifiées, partage en un lien, proxies Magic en PDF.' },
      ],
    },
  },

  // universes.css redefines the tokens of main.css per game universe, so it
  // must come after it.
  css: ['~/assets/css/main.css', '~/assets/css/universes.css'],

  // Icons come from the app's own route, never from the Iconify API. Only the
  // collection the app uses is bundled (simple-icons alone weighed 4.7 MB).
  icon: {
    serverBundle: { collections: ['lucide'] },
    fallbackToApi: false,
  },

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
  // the default in-memory store. What is still cached — EDHREC suggestions,
  // the coach's card validation, the landing art pool — would otherwise be
  // wiped on every restart, and the slow EDHREC cold-fetch paid again after
  // each deploy. Card data itself is local and not cached.
  nitro: {
    // Gzip and Brotli copies of the built assets, served to browsers that take them.
    compressPublicAssets: true,
    // The card databases refresh every night (server/tasks/cards/refresh.ts),
    // then every collection takes its reading of the day with the new prices
    // (server/tasks/collection/snapshot.ts).
    experimental: { tasks: true },
    scheduledTasks: { '30 4 * * *': ['cards:refresh'], '30 6 * * *': ['collection:snapshot'] },
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
  // Geist (+ Geist Mono) is the neutral type system. Each universe adds its
  // own voice: Anton and Bangers for One Piece's posters and sound effects,
  // Magic keeps the neutral face: it is a game played at a table, not a
  // grimoire. A face is only downloaded on a page that uses it.
  fonts: {
    families: [
      { name: 'Geist', provider: 'google', weights: [400, 500, 600, 700] },
      { name: 'Geist Mono', provider: 'google', weights: [400, 500] },
      { name: 'Anton', provider: 'google', weights: [400] },
      { name: 'Bangers', provider: 'google', weights: [400] },
    ],
  },
})
