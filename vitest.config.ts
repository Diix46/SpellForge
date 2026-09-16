import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Plain Node tests — these cover server-side query building, the local card
// databases and the pure game code, not Vue components, so no Nuxt environment
// is needed. `#shared` is Nuxt's alias for shared/, which app code imports.
export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The card databases are built by `npm run cards:ingest`; integration tests
    // skip themselves when they are absent (a fresh clone, or CI).
    testTimeout: 20000,
  },
})
