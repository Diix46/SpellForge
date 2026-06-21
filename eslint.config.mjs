import antfu from '@antfu/eslint-config'

// Antfu's flat config. Vue + TypeScript are auto-detected from deps.
// We run pure @antfu/eslint-config (no @nuxt/eslint), so Nuxt's auto-imported
// globals are declared below to avoid no-undef / no-use-before-define noise.
export default antfu(
  {
    type: 'app',
    vue: true,
    typescript: true,
    // Format CSS via eslint-plugin-format (Prettier-less).
    formatters: {
      css: true,
    },
    stylistic: {
      indent: 2,
      quotes: 'single',
    },
    ignores: [
      '.nuxt/**',
      '.output/**',
      'dist/**',
      'node_modules/**',
      'public/**',
      'mtg-proxy-printer/**', // stale leftover folder (locked by VS Code)
      'agent-coach/**', // separate Eve agent sub-project with its own toolchain
      'package-lock.json',
    ],
  },
  {
    // Nuxt 4 auto-imports — declared as readonly globals.
    languageOptions: {
      globals: {
        // Nuxt app
        defineNuxtConfig: 'readonly',
        defineAppConfig: 'readonly',
        defineNuxtPlugin: 'readonly',
        defineNuxtRouteMiddleware: 'readonly',
        navigateTo: 'readonly',
        useRoute: 'readonly',
        useRouter: 'readonly',
        useState: 'readonly',
        useFetch: 'readonly',
        useAsyncData: 'readonly',
        useRuntimeConfig: 'readonly',
        useHead: 'readonly',
        useSeoMeta: 'readonly',
        useNuxtApp: 'readonly',
        useToast: 'readonly',
        useColorMode: 'readonly',
        $fetch: 'readonly',
        // Nitro server (h3)
        defineEventHandler: 'readonly',
        readBody: 'readonly',
        getQuery: 'readonly',
        setHeader: 'readonly',
        createError: 'readonly',
        // Vue reactivity (auto-imported)
        ref: 'readonly',
        computed: 'readonly',
        reactive: 'readonly',
        shallowRef: 'readonly',
        watch: 'readonly',
        watchEffect: 'readonly',
        onMounted: 'readonly',
        onBeforeUnmount: 'readonly',
        onUnmounted: 'readonly',
        nextTick: 'readonly',
      },
    },
  },
  {
    // Project-specific relaxations.
    rules: {
      // App composables/components are auto-imported by Nuxt — no explicit imports.
      'import/no-unresolved': 'off',
    },
  },
)
