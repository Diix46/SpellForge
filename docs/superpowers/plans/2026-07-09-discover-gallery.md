# Galerie "Découvrir" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user publish an owned deck to a public, no-login "Découvrir" gallery via a dedicated toggle, separate from the existing private share-link feature.

**Architecture:** One new boolean column (`decks.public`) gated behind the existing `shareId` mechanism; two new/updated Nitro routes (`POST /api/decks/:id/publish`, cascade in `share.post.ts`, `GET /api/decks/discover`); store-level sync of `shareId`/`public` into the client `Deck` type; the deck page's one-shot "Share" button becomes a small settings modal with two switches; a new public `/discover` page lists results.

**Tech Stack:** Nuxt 4 (Nitro server routes), Vue 3 `<script setup>`, Drizzle ORM (libSQL/SQLite), Nuxt UI 4 (`UModal`, `USwitch`, `UButton`, `UInput`).

**Spec:** `docs/superpowers/specs/2026-07-09-discover-gallery-design.md`

## Global Constraints

- No test runner is configured in this project (no `vitest`/`pytest`/`test` script — confirmed via `package.json`). Verification is: `npm run lint`, `npm run typecheck`, `npm run build`, plus manual smoke testing (curl for the public unauthenticated route, live browser testing via the running `npm run dev` server for anything requiring a session cookie).
- Follow existing store convention: state mutations go through `useDeckStore`'s own methods, updating `decks.value` immutably (`decks.value[idx] = { ...existing, ...patch }; decks.value = [...decks.value]`) — never mutate a `Deck` object returned by `getDeck` in place.
- All server routes reuse existing utils (`requireOwnedDeck`, `requireAppUser`, `useDb`, `schema`, `genId`) — do not introduce new auth/db helpers.
- All user-facing strings go through `useLocale()`'s `t()` — add both the `fr` and `en` entries for every new key, in the same relative position in both blocks (mirroring the existing `share.*` block layout).
- Match existing file conventions exactly: composables/components are auto-imported by Nuxt (no explicit `import { useLocale } from ...` needed inside `app/`), server utils under `server/utils/**` are NOT auto-imported and need explicit relative imports (see `share.post.ts` for the exact relative path depth).
- Commit after each task, following this repo's commit convention (French, `type(scope): description`, seen in recent history — e.g. `feat(discover): ...`).

---

### Task 1: DB schema — `decks.public` column + migration

**Files:**
- Modify: `server/db/schema.ts`
- Generated (do not hand-write): new file(s) under `server/db/migrations/`

**Interfaces:**
- Produces: `schema.decks.public` (Drizzle column, `boolean`, `notNull`, default `false`) — consumed by every task below that touches `decks`.

- [ ] **Step 1: Add the column to the schema**

Edit `server/db/schema.ts`. Add `public` right after `shareId` in the `decks` table definition:

```ts
export const decks = sqliteTable('decks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  raw: text('raw').notNull().default(''),
  source: text('source'),
  // Public read-only share token (null = private). Indexed for lookup.
  shareId: text('share_id').unique(),
  // Listed in the public "Discover" gallery. Requires shareId to be set —
  // enforced in app logic (publish.post.ts), not a DB constraint.
  public: integer('public', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
}, t => [
  index('decks_user_idx').on(t.userId),
])
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`

Expected: drizzle-kit prints a new migration file name (e.g. `server/db/migrations/0001_<random_name>.sql`) and updates `server/db/migrations/meta/_journal.json` + adds a new `meta/000X_snapshot.json`. It should NOT ask any interactive questions (the column is a simple additive `ALTER TABLE ... ADD COLUMN` — no data migration prompt).

- [ ] **Step 3: Inspect the generated SQL**

Read the new file under `server/db/migrations/`. It must contain exactly one statement of the form:

```sql
ALTER TABLE `decks` ADD `public` integer DEFAULT false NOT NULL;
```

If drizzle-kit generated anything else (e.g. a table recreate), stop and report — that would mean the column definition doesn't match what's expected.

- [ ] **Step 4: Verify typecheck picks up the new column**

Run: `npm run typecheck`
Expected: no new errors (this step only adds a column; nothing references it yet).

- [ ] **Step 5: Commit**

```bash
git add server/db/schema.ts server/db/migrations
git commit -m "feat(discover): ajoute la colonne decks.public"
```

---

### Task 2: `POST /api/decks/:id/publish` + cascade in `share.post.ts`

**Files:**
- Create: `server/api/decks/[id]/publish.post.ts`
- Modify: `server/api/decks/[id]/share.post.ts`

**Interfaces:**
- Consumes: `requireOwnedDeck(event, id): Promise<{ user: AppUser, deck: DeckRow }>` (`server/utils/ownDeck.ts`), `genId(prefix?: string): string` (`server/utils/id.ts`), `schema.decks.public` (Task 1).
- Produces: `POST /api/decks/:id/publish` returning `{ shareId: string | null, public: boolean }` — consumed by Task 4 (`setPublic` in the store).

- [ ] **Step 1: Write `publish.post.ts`**

Create `server/api/decks/[id]/publish.post.ts`:

```ts
import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../../utils/db'
import { genId } from '../../../utils/id'
import { requireOwnedDeck } from '../../../utils/ownDeck'

// Toggle public listing in the Discover gallery for an owned deck. Enabling
// implicitly ensures a share link exists (Discover always points to
// /shared/:shareId) — it does NOT touch an already-active link. Disabling
// only unlists the deck; the private share link (if any) stays active.
// body: { enabled: boolean }. Returns the current shareId + public flag.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { deck } = await requireOwnedDeck(event, id)
  const body = await readBody(event).catch(() => ({})) as { enabled?: boolean }
  const enabled = body.enabled === true

  if (!enabled) {
    await useDb().update(schema.decks).set({ public: false, updatedAt: new Date() }).where(eq(schema.decks.id, id))
    return { shareId: deck.shareId, public: false }
  }

  const shareId = deck.shareId ?? genId('s_')
  await useDb().update(schema.decks).set({ shareId, public: true, updatedAt: new Date() }).where(eq(schema.decks.id, id))
  return { shareId, public: true }
})
```

- [ ] **Step 2: Add the cascade to `share.post.ts`**

Edit `server/api/decks/[id]/share.post.ts` — when the share link is disabled, also force `public` off (a public deck can't point at a dead link):

```ts
import { eq } from 'drizzle-orm'
import { schema, useDb } from '../../../utils/db'
import { genId } from '../../../utils/id'
import { requireOwnedDeck } from '../../../utils/ownDeck'

// Toggle public sharing for an owned deck.
// body: { enabled: boolean }. Returns the current shareId (or null when off).
// Disabling also unlists the deck from Discover (public requires a live shareId).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { deck } = await requireOwnedDeck(event, id)
  const body = await readBody(event).catch(() => ({})) as { enabled?: boolean }
  const enabled = body.enabled !== false // default: enable

  const shareId = enabled ? (deck.shareId ?? genId('s_')) : null
  const patch: { shareId: string | null, updatedAt: Date, public?: boolean } = { shareId, updatedAt: new Date() }
  if (!enabled)
    patch.public = false

  await useDb().update(schema.decks).set(patch).where(eq(schema.decks.id, id))
  return { shareId }
})
```

- [ ] **Step 3: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass clean.

- [ ] **Step 4: Manual smoke test via the running dev server**

Requires `npm run dev` running and an authenticated session (log in via the UI first, e.g. `http://localhost:3000`, then reuse the browser's session cookie for curl, OR just test end-to-end from the browser once Task 7's UI lands). nuxt-auth-utils' default session cookie is named `nuxt-session` (confirmed in `node_modules/nuxt-auth-utils/dist/module.mjs`, no override in `nuxt.config.ts`). As a quick backend-only sanity check with a real cookie (`<cookie>` = value of the `nuxt-session` cookie, copy from devtools → Application → Cookies once logged in):

```bash
curl -s -X POST http://localhost:3000/api/decks/<your-deck-id>/publish \
  -H "Content-Type: application/json" -H "Cookie: nuxt-session=<cookie>" \
  -d '{"enabled":true}'
```

Expected: `{"shareId":"s_...","public":true}`. Repeat with `{"enabled":false}` → expected `{"shareId":"s_...","public":false}` (shareId unchanged). Then test the cascade: `POST .../share` with `{"enabled":false}` after publishing → `GET` the deck (via the dashboard) and confirm `public` is now `false`.

- [ ] **Step 5: Commit**

```bash
git add server/api/decks/[id]/publish.post.ts server/api/decks/[id]/share.post.ts
git commit -m "feat(discover): ajoute la route publish + cascade sur share.post"
```

---

### Task 3: `GET /api/decks/discover`

**Files:**
- Create: `server/api/decks/discover.get.ts`

**Interfaces:**
- Consumes: `schema.decks`, `schema.users` (`server/db/schema.ts`), `useDb()` (`server/utils/db.ts`).
- Produces: `GET /api/decks/discover?q=<string>` returning `{ decks: Array<{ name: string, ownerDisplayName: string, updatedAt: number, shareId: string }> }` — consumed by Task 8 (`/discover` page).

- [ ] **Step 1: Write the route**

Create `server/api/decks/discover.get.ts`:

```ts
import { and, desc, eq, like } from 'drizzle-orm'
import { schema, useDb } from '../../utils/db'

// Public, unauthenticated listing of decks the owner opted to list in the
// Discover gallery. Minimal fields only — no raw decklist, no userId (same
// minimization as /api/shared/:shareId). Optional ?q= filters by deck name.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''

  const conditions = [eq(schema.decks.public, true)]
  if (q)
    conditions.push(like(schema.decks.name, `%${q}%`))

  const rows = await useDb()
    .select({
      name: schema.decks.name,
      updatedAt: schema.decks.updatedAt,
      shareId: schema.decks.shareId,
      ownerDisplayName: schema.users.displayName,
    })
    .from(schema.decks)
    .innerJoin(schema.users, eq(schema.decks.userId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.decks.updatedAt))
    .limit(60)
    .all()

  return { decks: rows }
})
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass clean.

- [ ] **Step 3: Manual smoke test (no auth needed)**

With `npm run dev` running and at least one deck published (from Task 2's smoke test):

```bash
curl -s http://localhost:3000/api/decks/discover
curl -s "http://localhost:3000/api/decks/discover?q=doesnotexist12345"
```

Expected: first call returns `{"decks":[{...the published deck...}]}` (no `raw`, no `userId` in the payload); second call returns `{"decks":[]}`.

- [ ] **Step 4: Commit**

```bash
git add server/api/decks/discover.get.ts
git commit -m "feat(discover): ajoute la route publique de listing"
```

---

### Task 4: Store — `Deck.shareId`/`Deck.public` + `setPublic`

**Files:**
- Modify: `app/composables/useDeckStore.ts`

**Interfaces:**
- Consumes: `POST /api/decks/:id/share` → `{ shareId: string | null }` (existing), `POST /api/decks/:id/publish` → `{ shareId: string | null, public: boolean }` (Task 2).
- Produces: `Deck.shareId?: string | null`, `Deck.public?: boolean`; `setPublic(id: string, enabled: boolean): Promise<boolean>` — consumed by Task 7 (Share modal).

- [ ] **Step 1: Extend the `Deck` interface**

In `app/composables/useDeckStore.ts`, extend the interface (line ~3):

```ts
export interface Deck {
  id: string
  name: string
  raw: string
  source?: string
  createdAt: number
  updatedAt: number
  shareId?: string | null
  public?: boolean
}
```

- [ ] **Step 2: Map the new fields in `fromRow`**

Update `fromRow` (line ~37):

```ts
function fromRow(r: any): Deck {
  return {
    id: r.id,
    name: r.name,
    raw: r.raw ?? '',
    source: r.source ?? undefined,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : new Date(r.createdAt).getTime(),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : new Date(r.updatedAt).getTime(),
    shareId: r.shareId ?? null,
    public: !!r.public,
  }
}
```

- [ ] **Step 3: Sync state in `setShare` and add `setPublic`**

Replace the existing `setShare` (line ~197-203) with a version that syncs the returned `shareId` (and clears `public` locally when disabled) into `decks.value`, and add `setPublic` right after it:

```ts
/** Enable/disable a public share link; returns the share token (or null). */
async function setShare(id: string, enabled: boolean): Promise<string | null> {
  if (!cloud.value)
    return null
  const { shareId } = await $fetch<{ shareId: string | null }>(`/api/decks/${id}/share`, { method: 'POST', body: { enabled } })
  const idx = decks.value.findIndex(d => d.id === id)
  if (idx !== -1) {
    decks.value[idx] = { ...decks.value[idx], shareId, ...(enabled ? {} : { public: false }) }
    decks.value = [...decks.value]
  }
  return shareId
}

/** Enable/disable listing this deck in the public Discover gallery. */
async function setPublic(id: string, enabled: boolean): Promise<boolean> {
  if (!cloud.value)
    return false
  const res = await $fetch<{ shareId: string | null, public: boolean }>(`/api/decks/${id}/publish`, { method: 'POST', body: { enabled } })
  const idx = decks.value.findIndex(d => d.id === id)
  if (idx !== -1) {
    decks.value[idx] = { ...decks.value[idx], shareId: res.shareId, public: res.public }
    decks.value = [...decks.value]
  }
  return res.public
}
```

- [ ] **Step 4: Export `setPublic`**

In the `return { ... }` block at the end of `useDeckStore` (line ~205-218), add `setPublic` next to `setShare`:

```ts
return {
  decks,
  cloud,
  ready,
  refresh,
  syncFromCloud,
  migrateLocalToCloud,
  getDeck,
  createDeck,
  updateDeck,
  deleteDeck,
  duplicateDeck,
  setShare,
  setPublic,
}
```

- [ ] **Step 5: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass clean.

- [ ] **Step 6: Commit**

```bash
git add app/composables/useDeckStore.ts
git commit -m "feat(discover): synchronise shareId/public dans le store et ajoute setPublic"
```

---

### Task 5: i18n keys

**Files:**
- Modify: `app/composables/useLocale.ts`

**Interfaces:**
- Produces: new `t()` keys consumed by Tasks 6-8: `nav.discover`, `modal.close`, `share.linkActive`, `share.linkActiveHint`, `share.listPublic`, `share.listPublicHint`, `share.copyError`, `discover.title`, `discover.subtitle`, `discover.searchPlaceholder`, `discover.empty`, `discover.updatedOn`, `discover.by`, `discover.error`, `discover.retry`.

- [ ] **Step 1: Add the FR keys**

In `app/composables/useLocale.ts`, FR block (`messages.fr`):

Right after `'nav.myDecks': 'Mes decks',` (line ~22), add:

```
    'nav.discover': 'Découvrir',
```

Locate `'modal.cancel': 'Annuler',` (line ~122) and add right after it:

```
    'modal.close': 'Fermer',
```

Right after the existing `'share.notFound': ...` line (line ~62), add:

```
    'share.linkActive': 'Lien de partage actif',
    'share.linkActiveHint': 'Toute personne avec le lien peut voir ce deck en lecture seule.',
    'share.listPublic': 'Lister dans Découvrir',
    'share.listPublicHint': 'Rend ce deck visible dans la galerie publique. Nécessite un lien de partage actif.',
    'share.copyError': 'Impossible de copier le lien',
    // Discover gallery
    'discover.title': 'Découvrir',
    'discover.subtitle': 'Les decks que la communauté a choisi de partager publiquement.',
    'discover.searchPlaceholder': 'Rechercher un deck…',
    'discover.empty': 'Aucun deck public pour l\'instant.',
    'discover.updatedOn': 'Mis à jour le',
    'discover.by': 'par',
    'discover.error': 'Impossible de charger la galerie.',
    'discover.retry': 'Réessayer',
```

- [ ] **Step 2: Add the EN keys**

In the EN block (`messages.en`), mirror the same keys at the same relative positions (after `'nav.myDecks': 'My decks',`, after `'modal.cancel': 'Cancel',`, and after `'share.notFound': ...`):

```
    'nav.discover': 'Discover',
```

```
    'modal.close': 'Close',
```

```
    'share.linkActive': 'Share link active',
    'share.linkActiveHint': 'Anyone with the link can view this deck read-only.',
    'share.listPublic': 'List in Discover',
    'share.listPublicHint': 'Makes this deck visible in the public gallery. Requires an active share link.',
    'share.copyError': 'Couldn\'t copy the link',
    // Discover gallery
    'discover.title': 'Discover',
    'discover.subtitle': 'Decks the community chose to share publicly.',
    'discover.searchPlaceholder': 'Search a deck…',
    'discover.empty': 'No public decks yet.',
    'discover.updatedOn': 'Updated on',
    'discover.by': 'by',
    'discover.error': 'Couldn\'t load the gallery.',
    'discover.retry': 'Retry',
```

- [ ] **Step 3: Verify the exact insertion points**

Run: `grep -n "'nav.myDecks'\|'modal.cancel'\|'share.notFound'" app/composables/useLocale.ts`
Expected: 6 matches (3 keys × 2 locale blocks) — confirms both blocks got all three insertions in the right neighborhoods. Then run `npm run typecheck` (a duplicate object key would still typecheck fine since it's a plain object literal — instead run `node -e "require('./app/composables/useLocale.ts')"` is not applicable for TS; just re-open the file and visually confirm no duplicate keys were introduced, since `Record<string,string>` silently overwrites duplicates rather than erroring).

- [ ] **Step 4: Verify lint**

Run: `npm run lint`
Expected: passes (checks key sort/format rules if any apply — fix any reported issues with `npm run lint:fix`).

- [ ] **Step 5: Commit**

```bash
git add app/composables/useLocale.ts
git commit -m "feat(discover): ajoute les clés i18n FR/EN"
```

---

### Task 6: Nav link in `app.vue`

**Files:**
- Modify: `app/app.vue`

**Interfaces:**
- Consumes: `t('nav.discover')` (Task 5).

- [ ] **Step 1: Add the nav entry**

In `app/app.vue`, the `nav` computed (line ~90-92) currently only has "Mes decks". Add a "Découvrir" entry, always visible (guest and logged-in — `/discover` requires no auth):

```ts
const nav = computed(() => [
  { to: '/', label: t('nav.myDecks'), icon: 'i-lucide-layout-grid' },
  { to: '/discover', label: t('nav.discover'), icon: 'i-lucide-compass' },
])
```

No other changes needed — both the desktop `<nav class="nav">` block (line ~124-140) and the mobile `<nav class="nav-mobile">` block (line ~195-211) already iterate `v-for="item in nav"` and will pick this up automatically. `isActive('/discover')` already works correctly via the existing generic branch (`route.path === to`).

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass clean (the route `/discover` doesn't exist yet until Task 8 — this is fine, `NuxtLink to="/discover"` doesn't require the route to exist at typecheck time).

- [ ] **Step 3: Commit**

```bash
git add app/app.vue
git commit -m "feat(discover): ajoute le lien Découvrir dans la nav"
```

---

### Task 7: Share modal on the deck page (replaces the one-shot Share button)

**Files:**
- Modify: `app/components/builder/DeckToolbar.vue`
- Modify: `app/pages/deck/[id].vue`

**Interfaces:**
- Consumes: `setShare(id, enabled): Promise<string | null>`, `setPublic(id, enabled): Promise<boolean>` (Task 4); `t('share.linkActive')`, `t('share.linkActiveHint')`, `t('share.listPublic')`, `t('share.listPublicHint')`, `t('share.copyError')`, `t('modal.close')` (Task 5).
- Produces: nothing new consumed elsewhere — this is a leaf UI change.

- [ ] **Step 1: Simplify `DeckToolbar.vue` — drop the `sharing` loading prop**

Opening a modal is instant (no network round-trip before it shows), so the toolbar button no longer needs a loading spinner. Edit `app/components/builder/DeckToolbar.vue`:

Remove `sharing: boolean` from the `defineProps<{ ... }>()` block (line ~16).

Remove `:loading="sharing"` from the Share `UButton` (line ~113), so it reads:

```vue
      <UButton
        v-if="loggedIn"
        icon="i-lucide-share-2"
        color="neutral"
        variant="subtle"
        size="sm"
        @click="emit('share')"
      >
        <span class="hidden lg:inline">{{ t('share.button') }}</span>
      </UButton>
```

(The `@share` emit itself is unchanged — only what the parent does with it changes, in Step 3.)

- [ ] **Step 2: Verify typecheck catches the removed prop everywhere it's passed**

Run: `npm run typecheck`
Expected: FAILS — `app/pages/deck/[id].vue` still passes `:sharing="sharing"` to `<BuilderDeckToolbar>` (line ~712), which no longer accepts that prop. This confirms the prop removal is wired correctly; Step 3 fixes it.

- [ ] **Step 3: Rework the deck page's share logic**

In `app/pages/deck/[id].vue`:

a) Line 27 — drop `setShare` from the store destructure (it moves into local handler functions that also need `setPublic`), and pull in `setPublic` instead:

```ts
const { getDeck, updateDeck, setShare, setPublic, ready: storeReady } = useDeckStore()
```

b) Find and remove the existing `sharing` ref and `shareDeck` function (currently ~line 124-142):

```ts
// Enable public sharing for this (cloud) deck and copy the link to the clipboard.
const sharing = ref(false)
async function shareDeck() {
  sharing.value = true
  try {
    const shareId = await setShare(deckId.value, true)
    if (!shareId)
      throw new Error('no share id')
    const url = `${window.location.origin}/shared/${shareId}`
    await navigator.clipboard.writeText(url)
    toast.add({ title: t('share.copied'), description: url, color: 'success', icon: 'i-lucide-link' })
  }
  catch {
    toast.add({ title: t('share.error'), color: 'error', icon: 'i-lucide-x' })
  }
  finally {
    sharing.value = false
  }
}
```

Replace it with the modal state + handlers:

```ts
// Share modal: two independent toggles (private link, public listing). Both
// read/write through the store so decks.value stays the single source of truth.
const showShareModal = ref(false)
const togglingShare = ref(false)
const togglingPublic = ref(false)

const shareUrl = computed(() => {
  if (!deck.value?.shareId || !import.meta.client)
    return ''
  return `${window.location.origin}/shared/${deck.value.shareId}`
})

async function onToggleShare(enabled: boolean) {
  togglingShare.value = true
  try {
    await setShare(deckId.value, enabled)
  }
  catch {
    toast.add({ title: t('share.error'), color: 'error', icon: 'i-lucide-x' })
  }
  finally {
    togglingShare.value = false
  }
}

async function onTogglePublic(enabled: boolean) {
  togglingPublic.value = true
  try {
    await setPublic(deckId.value, enabled)
  }
  catch {
    toast.add({ title: t('share.error'), color: 'error', icon: 'i-lucide-x' })
  }
  finally {
    togglingPublic.value = false
  }
}

async function copyShareUrl() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    toast.add({ title: t('share.copied'), description: shareUrl.value, color: 'success', icon: 'i-lucide-link' })
  }
  catch {
    toast.add({ title: t('share.copyError'), color: 'error', icon: 'i-lucide-x' })
  }
}
```

c) In the template, find `@share="shareDeck"` on `<BuilderDeckToolbar>` (line ~717) and change it to open the modal:

```vue
      @share="showShareModal = true"
```

d) Also remove the now-unused `sharing` prop binding on the same component (line ~712):

```vue
      :logged-in="loggedIn"
```

(delete the `:sharing="sharing"` line right after it).

- [ ] **Step 4: Add the Share modal to the template**

In `app/pages/deck/[id].vue`, right after the closing `</UModal>` of the Import/Export modal (currently ends at line ~931, right before the `<!-- Card detail modal -->` comment), add:

```vue
    <!-- Share settings: private link + public Discover listing -->
    <UModal
      v-model:open="showShareModal"
      :title="t('share.button')"
      :ui="{ overlay: 'bg-ink-950/70 backdrop-blur-[6px]', content: 'glass rounded-[var(--radius-2xl)]' }"
    >
      <template #body>
        <div class="space-y-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <div class="text-sm font-medium text-(--color-text-high)">
                {{ t('share.linkActive') }}
              </div>
              <p class="text-xs text-(--color-text-muted)">
                {{ t('share.linkActiveHint') }}
              </p>
            </div>
            <USwitch
              :model-value="!!deck?.shareId"
              :loading="togglingShare"
              :disabled="togglingShare"
              @update:model-value="onToggleShare"
            />
          </div>

          <div v-if="deck?.shareId" class="flex items-center gap-2">
            <UInput :model-value="shareUrl" readonly class="w-full font-mono text-xs" />
            <UButton icon="i-lucide-clipboard-copy" color="neutral" variant="subtle" @click="copyShareUrl" />
          </div>

          <div class="flex items-center justify-between gap-4" :class="{ 'opacity-50': !deck?.shareId }">
            <div>
              <div class="text-sm font-medium text-(--color-text-high)">
                {{ t('share.listPublic') }}
              </div>
              <p class="text-xs text-(--color-text-muted)">
                {{ t('share.listPublicHint') }}
              </p>
            </div>
            <USwitch
              :model-value="!!deck?.public"
              :disabled="!deck?.shareId || togglingPublic"
              :loading="togglingPublic"
              @update:model-value="onTogglePublic"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton color="neutral" variant="subtle" @click="showShareModal = false">
            {{ t('modal.close') }}
          </UButton>
        </div>
      </template>
    </UModal>
```

- [ ] **Step 5: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass clean.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Manual browser verification**

With `npm run dev` running, log in, open a cloud deck, click "Partager": modal opens with both switches off. Toggle "Lien de partage actif" on → URL + copy button appear, toast on copy. Toggle "Lister dans Découvrir" on → switch enables. Toggle "Lien de partage actif" off → "Lister dans Découvrir" switch visually goes back off and greys out (cascade). Re-open the modal (close/reopen) to confirm state persisted from the server, not just local UI state.

- [ ] **Step 8: Commit**

```bash
git add app/components/builder/DeckToolbar.vue app/pages/deck/[id].vue
git commit -m "feat(discover): remplace le partage one-shot par une modale à deux réglages"
```

---

### Task 8: `/discover` page

**Files:**
- Create: `app/pages/discover.vue`

**Interfaces:**
- Consumes: `GET /api/decks/discover?q=` (Task 3) → `{ decks: Array<{ name: string, ownerDisplayName: string, updatedAt: number, shareId: string }> }`; `t('discover.*')` (Task 5); `formatShortDate(ts: number): string` (existing, `useLocale`).
- Produces: route `/discover`, linked from Task 6's nav entry.

- [ ] **Step 1: Write the page**

Create `app/pages/discover.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

interface DiscoverDeck {
  name: string
  ownerDisplayName: string
  updatedAt: number
  shareId: string
}

const { t, formatShortDate } = useLocale()

const decks = ref<DiscoverDeck[]>([])
const loading = ref(true)
const errored = ref(false)
const query = ref('')

useSeoMeta({
  title: () => t('discover.title'),
  description: () => t('discover.subtitle'),
})

async function load() {
  loading.value = true
  errored.value = false
  try {
    decks.value = (await $fetch<{ decks: DiscoverDeck[] }>('/api/decks/discover', {
      query: query.value ? { q: query.value } : {},
    })).decks
  }
  catch {
    errored.value = true
  }
  finally {
    loading.value = false
  }
}

let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(query, () => {
  if (searchDebounce)
    clearTimeout(searchDebounce)
  searchDebounce = setTimeout(load, 300)
})

onMounted(load)
</script>

<template>
  <div class="discover-page fade-up">
    <header class="discover-head">
      <h1 class="discover-title">
        {{ t('discover.title') }}
      </h1>
      <p class="discover-subtitle">
        {{ t('discover.subtitle') }}
      </p>
      <UInput
        v-model="query"
        icon="i-lucide-search"
        :placeholder="t('discover.searchPlaceholder')"
        class="discover-search"
      />
    </header>

    <div v-if="loading" class="discover-state">
      <UIcon name="i-lucide-loader-circle" class="h-8 w-8 animate-spin text-(--accent-text)" />
    </div>

    <div v-else-if="errored" class="discover-state">
      <p class="text-(--color-text-muted)">
        {{ t('discover.error') }}
      </p>
      <UButton color="neutral" variant="subtle" icon="i-lucide-refresh-cw" @click="load">
        {{ t('discover.retry') }}
      </UButton>
    </div>

    <div v-else-if="decks.length === 0" class="discover-state">
      <p class="text-(--color-text-muted)">
        {{ t('discover.empty') }}
      </p>
    </div>

    <div v-else class="discover-grid">
      <NuxtLink
        v-for="d in decks"
        :key="d.shareId"
        :to="`/shared/${d.shareId}`"
        class="discover-card"
      >
        <h3 class="discover-card-name">
          {{ d.name }}
        </h3>
        <p class="discover-card-meta">
          {{ t('discover.by') }} <span class="font-medium text-(--color-text-mid)">{{ d.ownerDisplayName }}</span>
          · {{ t('discover.updatedOn') }} {{ formatShortDate(d.updatedAt) }}
        </p>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.discover-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 20px 60px;
}
.discover-head {
  margin-bottom: 28px;
}
.discover-title {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text-high);
}
.discover-subtitle {
  margin-top: 6px;
  color: var(--color-text-muted);
  font-size: 14px;
}
.discover-search {
  margin-top: 16px;
  max-width: 360px;
}
.discover-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 0;
  text-align: center;
}
.discover-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}
.discover-card {
  display: block;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
  background: var(--color-surface-1);
  transition:
    border-color var(--dur) var(--ease-out),
    transform var(--dur-slow) var(--ease-spring);
}
.discover-card:hover {
  border-color: var(--accent-border);
  transform: translateY(-2px);
}
.discover-card-name {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-high);
  margin-bottom: 6px;
}
.discover-card-meta {
  font-size: 12.5px;
  color: var(--color-text-muted);
}
</style>
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass clean.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds, `/discover` appears in the generated route list.

- [ ] **Step 4: Manual browser verification**

With `npm run dev` running (and at least one deck published from Task 7's manual test): open `http://localhost:3000/discover` in a private/incognito context (no login). Confirm: the card for the published deck appears, shows the owner's display name and a formatted date, clicking it navigates to `/shared/:shareId` and renders the deck read-only. Type a search term that matches nothing → empty state appears. Clear the search → the card reappears. Confirm the "Découvrir" nav link (Task 6) is visible and highlights as active on this route, while logged out.

- [ ] **Step 5: Commit**

```bash
git add app/pages/discover.vue
git commit -m "feat(discover): ajoute la page /discover"
```

---

### Task 9: Final full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full check**

Run in order:
```bash
npm run lint
npm run typecheck
npm run build
```
Expected: all three succeed with zero errors/warnings.

- [ ] **Step 2: End-to-end manual walkthrough**

With `npm run dev` running:
1. Log in as a cloud user, open a deck with cards in it.
2. Click "Partager" → toggle "Lien de partage actif" on → copy the link → open it in a new private tab → confirm the read-only shared view renders correctly (unchanged from before this feature).
3. Back in the modal, toggle "Lister dans Découvrir" on.
4. Open `/discover` in the same private tab (no login) → confirm the deck appears, search for its name → confirm it's found, click through → lands on the same read-only shared view.
5. Back in the modal, toggle "Lister dans Découvrir" off → refresh `/discover` → deck no longer appears, but the direct `/shared/:shareId` link (still saved from step 2) still works.
6. Toggle "Lien de partage actif" off entirely → refresh `/discover` → still absent; open the old `/shared/:shareId` link → now 404s (`share.notFound`).
7. Toggle both back on, this time verify "Lister dans Découvrir" cannot be turned on before "Lien de partage actif" is (switch is disabled/greyed while link is off).
8. Toggle both languages (FR/EN) via the header switch while the Share modal and `/discover` page are open — confirm every new string translates (no raw keys visible, no leftover French/English in the other locale).

- [ ] **Step 3: Report**

Summarize pass/fail for each of the 8 sub-checks in Step 2, plus the lint/typecheck/build results from Step 1.
