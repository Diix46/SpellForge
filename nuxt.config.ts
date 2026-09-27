import { GAME_LIST } from './shared/game'

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
    // A member's public profile: shared, so rendered with its preview.
    '/joueur/**': { ssr: true },
    // Each game's library, card and shared-deck pages are rendered on the server.
    ...Object.fromEntries(GAME_LIST.flatMap(g => [`/${g.slug}`, `/${g.slug}/card/**`, `/${g.slug}/shared/**`].map(path => [path, { ssr: true }]))),
    // The 3D library's scanned materials and the self-hosted fonts: kept a
    // month by the browser (their names change with their content).
    '/textures/**': { headers: { 'cache-control': 'public, max-age=2592000, stale-while-revalidate=86400' } },
    '/fonts/**': { headers: { 'cache-control': 'public, max-age=2592000' } },
    // The service worker is checked for updates on every visit.
    '/sw.js': { headers: { 'cache-control': 'no-cache' } },
  },

  // The public address, for canonical links and the sitemap
  // (NUXT_PUBLIC_SITE_URL). Empty: the address of the request.
  runtimeConfig: {
    // Who may read the error journal (/admin/erreurs): comma-separated emails,
    // from NUXT_ADMIN_EMAILS.
    adminEmails: '',
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
      title: 'Prism, l\'atelier de decks et de collection de cartes',
      meta: [
        { name: 'description', content: 'Construis tes decks et range ta collection One Piece, Magic, Pokémon, Yu-Gi-Oh! et Riftbound : toutes les cartes en français, règles vérifiées, classeurs et bibliothèque en 3D.' },
        // Installed on a phone: its own window, the bar in the app's colour.
        { name: 'theme-color', content: '#09090d' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Prism' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
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
      // Magic's binder spines: engraved capitals.
      { name: 'Cinzel', provider: 'google', weights: [600, 700] },
      // The generic engine's games speak with their cards' type (free
      // look-alikes of the printed ones): Pokémon's Gill Sans, Yu-Gi-Oh's
      // Matrix small caps (Enriqueta), Riftbound's Spiegel under League's Beaufort.
      { name: 'Cabin', provider: 'google', weights: [500, 600, 700] },
      { name: 'Enriqueta', provider: 'google', weights: [700] },
      // Magic's card names (Beleren): its look-alike for the 3D spines and the menu.
      { name: 'Philosopher', provider: 'google', weights: [700] },
      { name: 'Source Sans 3', provider: 'google', weights: [400, 600] },
    ],
  },
})
