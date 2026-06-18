# Architecture & context — Spellforge

Internal reference for fast onboarding (human or AI agent). Pairs with [README.md](README.md)
(user-facing) — this file is the **how & why**.

## TL;DR

- **Nuxt 4 SPA** (`ssr: false`) + **Nitro** server routes that proxy & cache external APIs.
- **No backend / no database yet** — decks live in `localStorage` (`mtg_decks_v1`),
  locale in `mtg_locale`. (Auth + cloud decks are planned — see "Roadmap".)
- **External data**: [Scryfall](https://scryfall.com) (cards, prices, prints) and
  [EDHREC](https://edhrec.com) (commander suggestions), always via `server/api/*`
  (CORS + caching + rate-limit protection).
- The whole UI is driven by **one source of truth per deck: the raw decklist text**.
  Everything else (structured entries, resolved cards, stats) derives from it.

## Directory map

```
app/
  app.vue                     # shell: header (FR/EN switch, nav), <AppBackground>, footer, cine transition
  app.config.ts               # Nuxt UI colour aliases (primary=cyan, secondary=magenta, neutral=ink)
  assets/css/main.css         # design system: @theme tokens + utilities (.glass, .neon-edge, .spotlight…)
  components/
    AppLogo.vue               # "Mana Prism" SVG logo
    DeckTile.vue              # dashboard deck card (tilt + spotlight + mana pips)
    MtgCardPreview.vue        # preview-grid card (holo sheen + reactive glow)
    CardDetailModal.vue       # big card modal: localized text, mana pips, print selector
    ExportConsole.vue         # PDF export "hardware console"
    builder/
      CardSearchPanel.vue     # live Scryfall search: text/themes/filters/sort, autocomplete, suggestions
      DeckListPanel.vue       # the deck: grouped rows (thumb + mana pips), stats, curve, price, validation
    mana/
      ManaSymbol.vue          # one mana pip ({T},{W},{W/U},{2}…)
      ManaCost.vue            # parses "{2}{W}{U}" → row of ManaSymbol
    fx/AppBackground.vue      # aurora mesh + mana-mote canvas (deck-coloured)
  composables/                # see "Composables" below
  pages/
    index.vue                 # dashboard: deck grid, new/rename/delete/import modals
    deck/[id].vue             # the deck page: Deck / Aperçu / Acheter tabs
server/api/
  cards/search.get.ts         # Scryfall search proxy (cached 60s + SWR 24h; FR price backfill)
  cards/autocomplete.get.ts   # Scryfall name autocomplete (cached 1h)
  cards/suggestions.get.ts    # EDHREC "played with" (cached 24h, empties NOT cached)
  cards/prints.get.ts         # all printings of a card for the edition selector (cached 24h)
  proxy-image.get.ts          # streams Scryfall images same-origin (CORS) for canvas/PDF; cached 7d
  import.post.ts              # EDHREC URL → decklist
assets/css, public/, nuxt.config.ts, app.config.ts
```

## Composables (the core)

| Composable | Responsibility |
|---|---|
| `useMtg` | **Shared MTG knowledge**: `ManaColor`/`WUBRG`, type classification (`CATEGORY_DEFS`, `classifyType`, `isCommanderType`, `CATEGORY_ORDER`), basics + "any number" sets, locale-aware display helpers (`displayName/displayType/displayOracle`, `englishTypeLine`), and **`translateTypeLine`** (FR fallback when Scryfall lacks `printed_type_line`). |
| `useDeckStore` | CRUD over decks; `useState('decks')` singleton hydrated from `localStorage`. |
| `useDecklist` | `parse(raw)` → `{mainboard, sideboard, errors}` and `totalCards`. Reads the Arena `(SET) NUM` suffix. |
| `useDeckBuilder` | Stateful raw↔structured editing layer; `serialise()` writes back (incl. pinned `(SET) NUM`). `validateCommander()` = EDH rules. |
| `useCardSearch` | Scryfall queries (`buildScryfallQuery`), `search`/`loadMore`/`autocomplete`/`suggest`; out-of-order guard via `lastQuery`. |
| `useScryfall` | `fetchCollection` (batched `/collection`) + French resolution (`resolveFrench`, **bulk** `bulkPrefetchFrench`). |
| `useDeckAnalysis` | `typeStats`, `manaCurve`, `priceSummary`, `detectCommanderIndex`, `commanderColors`. |
| `useManaIdentity` | colour identity from raw text, `colorVar`, localized `colorName`/`colorCode`, accent styles. |
| `useAppTheme` | `useState` singleton: active deck colours drive the app-wide accent + background tint. |
| `useCardmarket` | `searchUrl`, `linksForResolved`, `wantsListText`, `wantsListImportUrl`. |
| `usePdfExport` | jsPDF layout + render (A4/A3, cut guides), image LRU+negative cache. |
| `useLocale` | FR/EN i18n dictionary + `locale`/`isFr`, `rarityLabel`. |
| `useTilt`, `useSpotlight` | pointer-driven CSS-var effects (rAF, reduced-motion aware). |
| `useErrors` | error-message helpers. |

## Key invariants (don't break these)

1. **Raw decklist is the source of truth.** Builder edits go through `useDeckBuilder.serialise()`;
   a `builderWriting` guard (cleared on `nextTick`) prevents the rawDecklist watcher from
   reloading and clobbering the edit being made.
2. **Card language follows the site locale.** FR site → FR printings/images. Names stored in the
   decklist stay **canonical English** (so EDHREC/Scryfall/Cardmarket keep working); FR display is
   derived for the UI only.
3. **EDHREC is English-only.** Suggestions use the **canonical English** commander name and a slug
   that **drops apostrophes** (`Y'shtola, Night's Blessed` → `yshtola-nights-blessed`).
4. **FR prices**: FR printings rarely carry an EUR price → the search route backfills the default
   (EN) printing's price; `priceEur` falls back to the matched card's price.
5. **Pinned printings** round-trip as the Arena `(SET) NUM` suffix; in FR, a pinned print only
   resolves to *its own* FR version, never a substitute art.
6. **Server caching**: search 60s+SWR, autocomplete 1h, suggestions 24h (empties never cached),
   prints 24h, images 7d. Cache keys must include every dimension that changes the result
   (locale lives inside the search `q`).
7. **`ssr: false`** but shared state still uses `useState` (SSR-safe singleton pattern) for consistency.
8. **Accessibility**: focus-visible neon ring everywhere; non-colour cues on status; effects respect
   `prefers-reduced-motion`.

## Data flow (open a deck)

```
route /deck/:id
  → watch(deckId): load raw from useDeckStore, builder.load(), background loadCards({silent})
  → fetchCollection(entries, locale)        # batched /collection + bulk FR prefetch
      → resolvedCards (ResolvedCard[])       # card + imageUrl + priceEur + lang
  → derived: commander, themeColors → useAppTheme (page accent + background)
  → derived maps: categoryByName, identityByName, displayNameByName, cardMetaByName
  → tabs: Deck (builder) · Aperçu (grid+stats) · Acheter (cost+links)
```

## Verify before pushing

```bash
npm run lint && npm run typecheck && npm run build
```
CI (`.github/workflows/ci.yml`) runs the same on push/PR to `main` (Node 24, `npm ci`).

> **Windows note**: local `npm ci` can fail with `EPERM unlink …*.node` if a dev server / AV holds a
> native binary. It's local-only; Linux CI is unaffected. Use `npm install` for local dev.

## Backend (auth + cloud decks)

- **DB**: Drizzle ORM + libSQL (`@libsql/client`), file at `.data/spellforge.db` (prebuilt
  binaries — no native compile; Turso-ready via `DATABASE_URL`/`DATABASE_AUTH_TOKEN`).
  Schema in `server/db/schema.ts` (`users`, `decks`). Migrations in `server/db/migrations`,
  applied on startup by `server/plugins/migrate.ts`. `npm run db:generate` / `db:migrate`.
- **Auth**: `nuxt-auth-utils` (scrypt password hash + sealed-cookie sessions).
  Routes `server/api/auth/{register,login,logout}.post.ts`; client via `useAuth` (wraps
  `useUserSession`) + `AuthModal.vue`. Session `user` shape asserted in `server/utils/appUser.ts`.
- **Cloud decks**: `server/api/decks/*` (list/create/patch/delete, owner-checked via
  `requireOwnedDeck`). `useDeckStore` is **cloud-aware** — signed-in = API source of truth (optimistic
  local mirror), guest = localStorage. `plugins/deck-sync.client.ts` migrates guest decks on first
  login and pulls the cloud set.
- **Sharing**: `POST /api/decks/:id/share` toggles a public `shareId`; `GET /api/shared/:shareId`
  is a no-auth read-only view.

## Roadmap (in progress, autonomous build)

- **AI deck assistance** — server-side suggestions (complete the deck, balance the curve, propose
  cuts) surfaced as **actions**, not a chat. `ANTHROPIC_API_KEY` via `.env` (never committed).
- **Easier buying** — best-effort Cardmarket wants-list / pre-filled cart (true 1-click needs a
  partner API that isn't public).
