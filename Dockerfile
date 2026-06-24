# syntax=docker/dockerfile:1

# ── Build stage ──────────────────────────────────────────────────────────────
# Full deps + Nuxt build → produces .output (a self-contained Node server that
# bundles its own runtime deps, incl. @libsql/client + drizzle-orm).
FROM node:20-slim AS build
WORKDIR /app

# Install deps with the lockfile (cached unless package*.json changes).
COPY package.json package-lock.json ./
RUN npm ci

# Build the app.
COPY . .
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
# Slim image: the built server + the migration SQL only. No dev deps, no source.
# A Nitro startup plugin (server/plugins/migrate.ts, bundled into .output) applies
# pending migrations on boot, reading ./server/db/migrations relative to CWD — so
# we ship that folder next to .output and run from /app.
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NUXT_PORT=3000
ENV NUXT_HOST=0.0.0.0

COPY --from=build /app/.output ./.output
COPY --from=build /app/server/db/migrations ./server/db/migrations

# SQLite DB + Nitro fs cache live here — mount this as a volume to persist them.
RUN mkdir -p /app/.data
VOLUME ["/app/.data"]

EXPOSE 3000

# .output/server/index.mjs is the Nitro server entrypoint.
CMD ["node", ".output/server/index.mjs"]
