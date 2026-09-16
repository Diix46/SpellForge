# syntax=docker/dockerfile:1

# ── Build stage ──────────────────────────────────────────────────────────────
# Full deps + Nuxt build → produces .output (a self-contained Node server that
# bundles its own runtime deps, incl. @libsql/client + drizzle-orm).
FROM node:24-slim AS build
WORKDIR /app

# Install deps with the lockfile (cached unless package*.json changes).
COPY package.json package-lock.json ./
RUN npm ci

# Build the app.
COPY . .
RUN npm run build

# libsql loads its native binding by a computed name (@libsql/<platform>),
# which the build's dependency trace cannot follow: without this copy the
# server stops at its first database access. npm installed the binding for
# this very platform, the one the runtime stage runs on.
RUN cp -R node_modules/@libsql/linux-* .output/server/node_modules/@libsql/

# sharp makes the image thumbnails: the mirror script runs it, and so does the
# Magic image route. The build traces sharp for the route, keeping only what
# the route loads (its dependencies as links into .nitro). The traced copy is
# replaced by the full package, with its own dependencies under its folder
# (where they cannot replace a version the server relies on), so the script
# never depends on what the trace happened to keep.
RUN rm -rf .output/server/node_modules/sharp \
 && mkdir -p .output/server/node_modules/sharp/node_modules \
 && cp -R node_modules/sharp/. .output/server/node_modules/sharp/ \
 && cp -R node_modules/@img node_modules/semver node_modules/detect-libc .output/server/node_modules/sharp/node_modules/

# ── Runtime stage ────────────────────────────────────────────────────────────
# Slim image: the built server, the migration SQL and the card scripts. No dev
# deps, no app source.
# A Nitro startup plugin (server/plugins/migrate.ts, bundled into .output) applies
# pending migrations on boot, reading ./server/db/migrations relative to CWD — so
# we ship that folder next to .output and run from /app.
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NUXT_PORT=3000
ENV NUXT_HOST=0.0.0.0

COPY --from=build /app/.output ./.output
COPY --from=build /app/server/db/migrations ./server/db/migrations

# The nightly card refresh (server/tasks/cards/refresh.ts) runs these scripts in
# child processes; they find @libsql/client in the server bundle.
COPY --from=build /app/scripts ./scripts
RUN ln -s .output/server/node_modules node_modules

# SQLite DB + Nitro fs cache live here — mount this as a volume to persist them.
RUN mkdir -p /app/.data
VOLUME ["/app/.data"]

EXPOSE 3000

# .output/server/index.mjs is the Nitro server entrypoint.
CMD ["node", ".output/server/index.mjs"]
