import { defineConfig } from 'vitest/config'

// Plain Node tests — these cover server-side query building and the local card
// databases, not Vue components, so no Nuxt environment is needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The card databases are built by `npm run cards:ingest`; integration tests
    // skip themselves when they are absent (a fresh clone, or CI).
    testTimeout: 20000,
  },
})
