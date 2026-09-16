# Architecture & context — Prism

Internal reference for fast onboarding (human or AI agent). Pairs with [README.md](README.md)
(user-facing) — this file is the **how & why**. The roadmap, measured figures and open
decisions live in [plan.md](plan.md).

## TL;DR

- **Two games, two universes**: One Piece Card Game (by day) and Magic: The Gathering (by
  night). Each page declares its universe in its page meta; `app.vue` stamps it on
  `<html data-universe>` and `assets/css/universes.css` re-themes the document.
- **Nuxt 4, hybrid rendering** + **Nitro** server routes. Public pages are server-rendered
  (`routeRules` in `nuxt.config.ts`: `/landing`, `/discover`, both libraries, card pages,
  shared decks); the workshop (`/`, deck pages) stays a browser app. The server has two kinds
  of data:
  - **User data** — accounts and decks in `.data/spellforge.db` (Drizzle + libSQL, migrated on
    boot; the file keeps the project's former name). Guests keep their decks in `localStorage`
    (`prism_decks_v2`, migrated from `mtg_decks_v1`), the locale is the `prism_locale` cookie.
  - **Card data** — local SQLite databases rebuilt from bulk dumps by a nightly Nitro task
    (`.data/cards-mtg.db`, `.data/cards-optcg.db`). Requests only read them.
- **No runtime call to the Scryfall API.** Search, deck resolution, printings, autocomplete
  and the coach's card search all query `.data/cards-mtg.db`. Card images are served by the
  app from a disk mirror (see "Card images").
- **External services still called at runtime**: [EDHREC](https://edhrec.com) (suggestions,
  imports), [Archidekt](https://archidekt.com) (imports), the Anthropic API (coach) and
  `cards.scryfall.io` (once per Magic image that is not mirrored yet). One Piece images are
  served from disk only.
- The whole UI is driven by **one source of truth per deck: the raw decklist text**.
  Everything else (structured entries, resolved cards, stats) derives from it.

## Directory map

```
app/
  app.vue                     # shell: header (FR/EN switch, nav), <AppBackground>, footer (Scryfall/EDHREC credits)
  app.config.ts               # Nuxt UI colour aliases (primary=cyan, secondary=magenta, neutral=ink)
  assets/css/main.css         # design system: @theme tokens + utilities (.glass, .neon-edge, .spotlight…)
  types/cards.ts              # GameCard: game-neutral card model, discriminated by `game`
  components/
    builder/
      CardSearchPanel.vue     # local card search: text/syntax, themes, filters, sort, autocomplete, suggestions
      search/                 # SearchFilters, SearchResultCard
      DeckListPanel.vue       # the deck: grouped rows, stats, curve, price, validation
      CoachChat.vue           # Eve coach chat
    card/PrintingPicker.vue   # edition selector (reads /api/cards/prints)
    CardDetailModal.vue       # big card modal: localized text, mana pips, print selector
    ExportConsole.vue         # PDF export "hardware console"
    landing/, dashboard/, mana/, fx/ …
  composables/                # see "Composables" below
    scryfall/                 # client-side adapters over the Scryfall-shaped JSON (helpers, toGameCard, toResolved, types)
  plugins/                    # deck-sync (guest → cloud), v-tilt directive, command palette
  assets/css/universes.css    # per-universe tokens, fonts, cursors, textures
  components/optcg/           # WantedCard (poster), FilterRail, CardView + CardSheet, DeckPanel, EffectText
  components/mtg/             # GrimoireCard (library page)
  components/deck/            # ShareModal, SaveWall (shared by both games)
  components/landing/Portal.vue  # split-screen home: One Piece left, Magic right
  pages/                      # index (dashboard), landing, discover, deck/[id] + shared/[shareId] (redirects)
    one-piece/                # index (library), deck/[id], card/[number], shared/[shareId]
    magic/                    # index (grimoire), deck/[id], card/[name], shared/[shareId]
shared/                       # pure code for app, server and tests: game.ts (ids, capabilities,
                              #   paths), decks.ts (guest storage v2), decklist formats, optcg rules
server/
  api/
    cards/browse.get.ts       # card search: structured filters AND Scryfall syntax, compiled locally
    cards/resolve.post.ts     # resolve a whole deck (≤ 250 entries) in one request
    cards/autocomplete.get.ts # card-name autocomplete
    cards/prints.get.ts       # every FR/EN printing of one card, for the edition picker
    cards/card-image.get.ts   # preview image by name, for the coach's hover cards
    cards/suggestions.get.ts  # EDHREC "played with" (server/utils/edhrec.ts)
    landing/cards.get.ts      # landing Magic art pool
    landing/optcg.get.ts      # landing One Piece posters
    optcg/*                   # One Piece: browse, resolve, autocomplete, prints, sets
    images/optcg/[lang]/[file].get.ts  # One Piece image mirror, disk only, other-language fallback
    images/mtg/[size]/[face]/[file].get.ts  # serves the image mirror, back-fills missing files once
    import.post.ts            # EDHREC / Archidekt URL → decklist
    ai/suggest.post.ts        # one-shot deck actions (complete, cut, curve, theme) on the coach engine
    coach/session.post.ts, coach/stream/[id].get.ts  # Eve chat (turn start + NDJSON stream)
    auth/*, decks/*, shared/[shareId].get.ts          # accounts, cloud decks, public share
    [...].ts                  # any other /api/* path → 404 JSON
  utils/cards/                # local card engine, see "Card data"
  utils/                      # db.ts (app DB), edhrec.ts, suggestValidate.ts, rateLimit.ts, ownDeck.ts…
  eve/                        # coach: orchestrator, specialist agents, tools, in-memory runtime
  db/schema.ts, db/migrations/  # app DB schema (users, decks)
  plugins/migrate.ts          # applies app DB migrations on boot (a failure stops the server)
  plugins/cards-bootstrap.ts  # builds missing card databases on boot
  tasks/cards/refresh.ts      # nightly card refresh (scheduled in nuxt.config.ts)
  routes/                     # robots.txt, sitemap.xml, sitemaps/{pages,one-piece,magic}.xml
scripts/                      # card ingestion, verification and image mirroring (run by the task, or by hand)
test/                         # Vitest, Node environment
```

## Card data

### Three databases, on purpose

| File | Content | Written by |
|---|---|---|
| `.data/spellforge.db` | users, decks — irreplaceable | the app (Drizzle migrations in `server/db/migrations`, applied by `server/plugins/migrate.ts`) |
| `.data/cards-mtg.db` | Magic cards, FR + EN printings | `npm run cards:ingest` (`scripts/ingest-mtg.mjs`) |
| `.data/cards-optcg.db` | One Piece cards, FR + EN | `npm run cards:ingest:op` (`scripts/ingest-optcg.mjs`) |

The card databases are rebuildable caches, replaced wholesale by each ingest. Keeping them
apart from the app DB means an ingest can never touch a deck. Keeping one file per game
means a Magic refresh can never wipe One Piece. The app reads the Magic database through
`useMtgCardsDb()` and `useOptcgCardsDb()` (`server/utils/cards/db.ts`, paths overridable with
`MTG_CARDS_DB` / `OPTCG_CARDS_DB`).

### Refresh (`server/tasks/cards/refresh.ts`)

Nitro task `cards:refresh`, scheduled at 04:30 (`nitro.scheduledTasks`). It runs
`ingest-optcg.mjs`, `mirror-images-optcg.mjs` and `ingest-mtg.mjs` one after the other in
**child processes**: the scripts use the synchronous libSQL client, which would freeze the
server during a Magic rebuild. Each step gets three attempts (waits of 1 then 5 minutes;
the mirror exits with code 2 on a partial run). After each successful step
`reopenCardDbs()` drops the cached clients so the next request opens the swapped file; the
old handles close 30 s later. Each script does nothing when its source has not moved, so a
nightly run usually takes seconds. `server/plugins/cards-bootstrap.ts` starts the task at
boot when a database is missing or empty (the server creates an empty file when a request
opens a database that is not there; the scripts treat it as outdated).
`CARDS_REFRESH_ON_BOOT=false` disables that. In development:
`npx nuxi task run cards:refresh`.

The Docker image ships `scripts/`, links `/app/node_modules` to the server bundle's
`node_modules` (where the scripts find `@libsql/client`), and copies libSQL's native binding
into the bundle: libsql loads it by a computed name the build trace cannot follow.

### Magic ingestion (`scripts/ingest-mtg.mjs`)

- Reads `https://api.scryfall.com/bulk-data/all_cards` and compares its `updated_at` with the
  one stored in the `meta` table; the base is only rebuilt when the dump changed (`--force`
  rebuilds anyway). Since July 2026 the fields are `jsonl_download_uri` and
  `compressed_size`, and the file is gzipped JSONL.
- **Streams** the dump (fetch → gunzip → readline → `JSON.parse` per line), never holding it
  in memory, and keeps only `lang` `en` and `fr`. `all_cards` is required: `default_cards`
  holds almost no French printings.
- Network calls get **3 attempts** (2 s, then 4 s back-off); HTTP errors are not retried.
- Builds `cards-mtg-new.db`, then checkpoints the WAL, switches to `journal_mode = DELETE`,
  removes the old file and renames the new one into place. A server that already opened the
  file keeps reading the previous one until it restarts (see `db.ts`).
- Tables: `oracle_cards` (one row per card), `printings`, `card_faces`, `card_parts` (tokens),
  `oracle_faces` (one row per face, for per-face tests of the query syntax),
  `best_printings` (the printing to show per card and language, English fallback included),
  `card_search` (FTS5, `unicode61 remove_diacritics 2`, rules text indexed without reminder
  text, French printed name and text included), `meta`.
- Derived at ingest: 5-bit colour masks, sentinel sort columns (`edhrec_sort`, `price_sort`),
  the cheapest EUR price per card (`min_price_eur`), `is_extra` / `is_funny` computed over
  **all** printings of a card, and `self_text` (rules text with the card's self-references
  written `~`). Image URLs are **not** stored: they derive from printing id + `img_version`.
- Ends with `ANALYZE` (without statistics, an exact-name lookup took 32 ms instead of
  0.05 ms) and `VACUUM`.
- `npm run cards:verify` checks volumes, known Scryfall figures and query latency after an
  ingest; `npm run cards:verify:op` does the same for One Piece.

### Server modules (`server/utils/cards/`)

| Module | Responsibility |
|---|---|
| `db.ts` | Lazy clients for both card databases, separate from `useDb()`; `reopenCardDbs()` after a refresh. |
| `refresh.ts` | The refresh steps, `withRetries`, `runScript` (child process, output relayed to the log). |
| `optcg-query.ts` | One Piece search. `op_numbers` holds one row per card number (what filters and rules need); `op_best` names the printing shown per site language, English filling what French lacks. |
| `optcg-resolve.ts`, `optcg-shape.ts`, `optcg-params.ts` | One Piece resolution by number (and art id), row → `OptcgCard`, query parameter allowlists. |
| `mtg-query.ts` | The search engine. Colour tests are integer masks (`id<=` → `(mask & ~allowed) = 0`, `color>=` → `(mask & wanted) = wanted`). Sorting reads the non-null `*_sort` columns: an `IS NULL` guard at the head of `ORDER BY` defeats every index. A `WITH page AS (…)` CTE filters, sorts and pages `oracle_cards` **before** joining `best_printings` (otherwise SQLite scanned all of `best_printings`). Also builds the autocomplete, pinned-printing, prints and coach queries. Always applies `legal_commander = 1`, `is_funny = 0`, `is_extra = 0`. |
| `mtg-syntax.ts` | Scryfall query syntax → one SQL `WHERE` fragment, ANDed with the builder's filters. Tokenizer + parser (`or`, parentheses, `-` negation) + per-keyword handlers. Any filter it cannot honour throws `QuerySyntaxError` with a code (`unknownKeyword`, `unsupportedKeyword`, `badValue`, `badOperator`, `unbalanced`, `tooComplex`) and the offending term — never a silent no-op. Display options (`unique:`, `lang:`, `dir:`…) are ignored; `order:` overrides the requested sort. Printing terms (`s:`, `r:`, `a:`, `year:`, `is:promo`…) are all evaluated on **one** printing, of English printings. Power, toughness, loyalty and mana cost are tested per face. Known departures are listed in the module header. |
| `mtg-shape.ts` | Rebuilds the Scryfall JSON shape the client consumes (`image_uris` / `card_faces`, colours from masks, `all_parts` tokens, `prices.eur`) from local rows. Image URLs point at the local image route. |
| `mtg-resolve.ts` | Deck resolution: pinned `(SET) NUM` printings first (their own localised version, else the same printing in English — never another art), then by name through `best_printings`. `resolveCardsByName` serves the coach and AI validation. |
| `browse-params.ts` | Allowlists and bounds every `/api/cards/browse` query parameter. An absent `identity` means "no constraint"; a present one, even colourless, is a filter. |
| `text.ts` | `fold` (accent-insensitive key), `ftsPhrase`, `likeContains` — shared by the engine and the syntax compiler. |

### Card images

`/api/images/mtg/{size}/{face}/{id}.{ext}?v={version}` serves `.data/images/mtg/…`.
`small` and `normal` are pre-mirrored for the printings in `best_printings`
(`scripts/mirror-images-mtg.mjs`); `large`, `png` and `art_crop` are not. A missing file is
fetched **once** from `cards.scryfall.io`, written beside the target then renamed, and served
from disk afterwards. Responses are `immutable` for a year: the version is in the URL.
Every path segment is validated against an allowlist before touching the disk or the
upstream URL.

`/api/images/optcg/{lang}/{id}?v=` serves `.data/images/optcg` (7 731 files, French and
English) and **never** calls Bandai: a missing file falls back to the other language, then
404. `scripts/mirror-images-optcg.mjs` fills the mirror (only missing files are fetched).

Because images are same-origin, the PDF export reads them directly into data URLs; the
former CORS image proxy is gone.

### External dependencies

Listed in plan.md §7, with Archidekt added here:

| Dependency | Used for |
|---|---|
| EDHREC (`json.edhrec.com`) | "Often played with" suggestions, coach tool `edhrec_suggestions`, EDHREC imports |
| Archidekt (`archidekt.com/api`) | Deck imports |
| Anthropic API | The coach and the one-shot deck actions |
| `cards.scryfall.io` | One request per image that is not on disk yet |
| punk-records (GitHub), Bandai's site | One Piece data and images, read by the nightly task only |

Icons are served by the app (`/api/_nuxt_icon`) since hybrid rendering. Links to
scryfall.com and Cardmarket are plain user-opened links, not API calls; the command palette
opens cards in the local libraries.

## Composables (the core)

| Composable | Responsibility |
|---|---|
| `useMtg` | **Shared MTG knowledge**: `ManaColor`/`WUBRG`, type classification (`CATEGORY_DEFS`, `classifyType`, `isCommanderType`, `CATEGORY_ORDER`), basics + "any number" sets, locale-aware display helpers (`displayName/displayType/displayOracle`, `englishTypeLine`), and **`translateTypeLine`** (FR fallback when a printing lacks `printed_type_line`). |
| `useDeckStore` | CRUD over decks; `useState('decks')` singleton. Cloud-aware (see "Backend"). |
| `useDecklist` | `parse(raw)` → `{mainboard, sideboard, errors}` and `totalCards`. Reads the Arena `(SET) NUM` suffix. |
| `useDeckBuilder` | Stateful raw↔structured editing layer; `serialise()` writes back (incl. pinned `(SET) NUM`). `validateCommander()` = EDH rules. |
| `useCardSearch` | One search path: `search`/`loadMore` call `GET /api/cards/browse` with the filters as query parameters (`browseParams`); text in Scryfall syntax travels as plain `text` and is compiled server-side. A 400 syntax refusal is shown as a localized message (`search.syntax.<code>` + the term) instead of "no results". `autocomplete` → `/api/cards/autocomplete`; `suggest` → EDHREC names, then `POST /api/cards/resolve`. A monotonic request id plus `AbortController` discard superseded requests. |
| `useScryfall` | `fetchCollection(entries, lang)` → `POST /api/cards/resolve` in batches of 250 (one request for a Commander deck), then `toResolved` per entry. Re-exports the card types and adapters (`GameCard`, `toMtgCard`, `mtgRaw`, image helpers). The name is historical: nothing here calls Scryfall. |
| `useResolvedCards` | The deck page's resolution engine: resolved cards, progress, dirty flag, monotonic-token `loadCards()` over `fetchCollection`. |
| `useDeckAnalysis` | `typeStats`, `manaCurve`, `priceSummary`, `detectCommanderIndex`, `commanderColors`. |
| `useManaIdentity` | colour identity from raw text, `colorVar`, localized `colorName`/`colorCode`, accent styles. |
| `useAppTheme` | `useState` singleton: active deck colours drive the app-wide accent + background tint. |
| `useCardmarket` | `searchUrl`, `linksForResolved`, `wantsListText`, `wantsListImportUrl`. |
| `usePdfExport` | jsPDF layout + render (A4/A3, cut guides); images fetched same-origin (8 at a time) into an LRU + negative cache. |
| `useLocale` | FR/EN i18n dictionary (including the `search.syntax.*` error strings) + `locale`/`isFr`, `rarityLabel`. The locale is read once from the `prism_locale` cookie (by the server on a rendered page); `?lang=` changes and keeps it (`app.vue`). |
| `useUniverse`, `useUniverseFx` | The page's universe (page meta), and the add-card burst ("DON!!" by day, a gold word by night). |
| `useOptcgDeck`, `useOptcgSearch` | One Piece deck editing over the decklist text (rules from `shared/optcg/deck.ts`) and library search. |
| `useDeckAutosave`, `useDeckFingerprints` | Debounced save with undo/redo shared by both deck pages; per-deck tile data for the dashboard (Leader resolved in one request). |
| `usePublicSeo` | Title, description, canonical, hreflang alternates, Open Graph for server-rendered pages (`NUXT_PUBLIC_SITE_URL`). |
| `useCoach`, `useCoachHistory` | Eve coach client (session + NDJSON stream, tool-call labels) and its stored conversations. |
| `useSpotlight` | pointer-driven CSS-var effect (rAF, reduced-motion aware). The tilt effect is the `v-tilt` directive (`plugins/tilt.client.ts`). |
| `useErrors` | error-message helpers. |

### `GameCard` (`app/types/cards.ts`)

`ResolvedCard.card` is a `GameCard`: a base with the fields every game shares (`id`, `name`,
`cmc`, `colorIdentity`, `typeLine`) and a `game` discriminant (`'mtg' | 'optcg'`). The Magic
variant carries the Scryfall-shaped JSON in `raw`; Magic-only code must narrow first, via
`mtgRaw()`. One Piece screens use their own `OptcgCard` (`shared/optcg/types.ts`) end to
end; there is no polymorphic card provider (plan.md §6 ter).

## Key invariants (don't break these)

1. **Raw decklist is the source of truth.** Builder edits go through `useDeckBuilder.serialise()`
   inside `builderOp()` (deck page); its `writeDepth` re-entrancy counter, released on
   `nextTick`, keeps the rawDecklist watcher from reloading and clobbering the edit being made.
2. **Card language follows the site locale.** FR site → FR printings/images, English fallback
   per card (`best_printings`). Names stored in the decklist stay **canonical English** (so
   EDHREC and Cardmarket keep working); FR display is derived for the UI only.
3. **EDHREC is English-only.** Suggestions use the **canonical English** commander name and a slug
   that **drops apostrophes** (`Y'shtola, Night's Blessed` → `yshtola-nights-blessed`).
4. **Prices**: only ~2 % of French printings carry an EUR price. `prices.eur` is the printing's
   own price, else the card's cheapest (`min_price_eur`). The budget filter and `eur:` always
   use the cheapest printing, never the displayed one.
5. **Pinned printings** round-trip as the Arena `(SET) NUM` suffix; in FR, a pinned print only
   resolves to *its own* FR version, never a substitute art.
6. **A search filter is honoured or refused.** `mtg-syntax.ts` throws on anything it cannot
   evaluate; `/api/cards/browse` turns that into a 400 with `{ code, term }`, the coach tool
   into an error message for the model. Never drop a filter silently.
7. **Resolution preserves order.** `/api/cards/resolve` answers by index; an invalid entry
   rejects the whole request rather than shifting every card after it.
8. **Server caching**: the local card routes are not cached (indexed queries are faster than a
   cache round trip). Cached: the landing art pools (2 min per language), EDHREC (24 h, empty
   results never cached), the coach's `validate_cards` (5 min) and the sitemap card lists
   (24 h). The Nitro cache is stored on disk in `.data/cache`. Cache keys must include every
   dimension that changes the result. A cached **handler** does not see the request's headers
   (the host included): anything built from the request stays outside the cache, as the
   sitemaps do with `defineCachedFunction`.
9. **Hybrid rendering**: a server-rendered page hands over `useState` as the server saw it, so
   the guest deck list arrives empty; `plugins/deck-sync.client.ts` reloads it from
   `localStorage` before anything can write. Never read `localStorage`, `window` or
   `document` at setup time in code a public page runs; load public data with
   `useAsyncData`/`useFetch` so it is rendered, and keep library searches client-side.
10. **Accessibility**: focus-visible neon ring everywhere; non-colour cues on status; effects respect
    `prefers-reduced-motion`.
11. **One Piece cards are never printed.** `CAPABILITIES.optcg.proxyPdf` is false, One Piece
    pages never load the PDF code, and `assertProxyPrintable()` makes the export throw on a
    One Piece card anyway.
12. **Shared decks are indexed only when listed in Discover** (`noindex` otherwise, and only
    public decks appear in the sitemap).

## Data flow (open a Magic deck)

```
route /magic/deck/:id  (/deck/:id redirects to the deck's universe)
  → watch([deckId, storeReady]) → initDeck(): load raw from useDeckStore, builder.load(),
    background loadCards({silent}) on nextTick
  → useResolvedCards → fetchCollection(entries, locale)
      → POST /api/cards/resolve               # pinned printings, then best_printings by name
      → resolvedCards (ResolvedCard[])        # GameCard + imageUrl + priceEur + lang
  → derived: commander, themeColors → useAppTheme (page accent + background)
  → derived maps: categoryByName, identityByName, displayNameByName, cardMetaByName
  → tabs: Deck (builder) · Aperçu (grid+stats) · Acheter (cost+links)
```

## Coach (Eve, `server/eve/`)

An orchestrator runs a streaming tool-use loop on the Anthropic Messages API and consults
specialist agents (`agents.ts`), which use the same real-data tools (`tools.ts`):

- `scryfall_search` — keeps its name (the front labels tool calls by it, and the syntax is
  still Scryfall's) but runs `buildCoachSearchQuery` against the local database: same
  syntax compiler, no commander constraint, up to 20 cards, most played first. A
  `QuerySyntaxError` is returned to the model as `{ error, cards: [] }` so it can rephrase.
- `edhrec_suggestions` — `server/utils/edhrec.ts`.
- `validate_cards` — `resolveCardsByName` on the local database, then identity and
  Commander legality checks.

Sessions and conversations live in memory (`runtime.ts`). Without `ANTHROPIC_API_KEY` the
coach answers 503.

## Verify before pushing

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck and build on pull requests to `main`
(Node 24, `npm ci`); `release.yml` runs the same before semantic-release on every push to
`main`. **Neither runs the tests.** The integration tests skip themselves when
`.data/cards-mtg.db` is absent, so a green `npm run test` only covers the database after a
local `npm run cards:ingest`.

> **Windows note**: local `npm ci` can fail with `EPERM unlink …*.node` if a dev server / AV holds a
> native binary. It's local-only; Linux CI is unaffected. Use `npm install` for local dev.

## Backend (auth + cloud decks)

- **DB**: Drizzle ORM + libSQL (`@libsql/client`), file at `.data/spellforge.db` (prebuilt
  binaries — no native compile; Turso-ready via `DATABASE_URL`/`DATABASE_AUTH_TOKEN`).
  Schema in `server/db/schema.ts` (`users`, `decks`). Migrations in `server/db/migrations`,
  applied on startup by `server/plugins/migrate.ts`. `npm run db:generate` / `db:migrate`.
- **Auth**: `nuxt-auth-utils` (scrypt password hash + sealed-cookie sessions, requires
  `NUXT_SESSION_PASSWORD`). Routes `server/api/auth/{register,login,logout}.post.ts`; client via
  `useAuth` (wraps `useUserSession`) + `AuthModal.vue`. Session `user` shape asserted in
  `server/utils/appUser.ts`.
- **Cloud decks**: `server/api/decks/*` (list/create/patch/delete, owner-checked via
  `requireOwnedDeck`). `useDeckStore` is **cloud-aware** — signed-in = API source of truth (optimistic
  local mirror), guest = localStorage. `plugins/deck-sync.client.ts` migrates guest decks on first
  login and pulls the cloud set.
- **Sharing**: `POST /api/decks/:id/share` toggles a public `shareId`; `GET /api/shared/:shareId`
  is a no-auth read-only view. `POST /api/decks/:id/publish` toggles the deck's listing in the
  public Discover gallery (`GET /api/decks/discover`), creating the share link if needed.

## Roadmap

[plan.md](plan.md) §6 lists the delivered lots (0 to 9) and §6 ter the decisions taken along
the way. Open points: rate limiting `/api/cards/browse` at the reverse proxy, running `npm run
test` in CI, and whether to hide Universes Beyond reprints from the default Magic display.
