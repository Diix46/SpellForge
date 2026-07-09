import { useState } from '#app'

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

const STORAGE_KEY = 'mtg_decks_v1'

function genId(): string {
  return `d_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function loadLocal(): Deck[] {
  if (import.meta.server)
    return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}

function persistLocal(decks: Deck[]) {
  if (import.meta.client)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks))
}

// Normalize a server deck row (timestamps may be ms numbers or ISO strings).
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

export function useDeckStore() {
  // SSR-safe shared singleton; starts from localStorage (guest), replaced by
  // cloud decks once signed in (see syncFromCloud / migrateLocalToCloud).
  const decks = useState<Deck[]>('decks', loadLocal)
  const { loggedIn } = useUserSession()
  const { t } = useLocale()
  const toast = useToast()

  // A failed cloud write must not fail silently: the optimistic local state
  // already changed, so at minimum tell the player it didn't actually save.
  function reportSaveFailure() {
    toast.add({
      title: t('toast.saveFailed'),
      description: t('toast.saveFailedDesc'),
      color: 'error',
      icon: 'i-lucide-cloud-off',
    })
  }
  // True once we're operating against the cloud (signed in). Guest = local only.
  const cloud = computed(() => loggedIn.value)
  // Has the store finished its initial load? For guests this is immediate
  // (localStorage is synchronous); for signed-in users it only flips true once
  // the cloud decks have been fetched. Consumers (e.g. the deck page guard)
  // must not conclude "deck not found" before this is true, or a direct
  // navigation/refresh would redirect away before the cloud set arrives.
  const ready = useState<boolean>('decks-ready', () => !loggedIn.value)

  function persist() {
    // Guests persist to localStorage; signed-in users' source of truth is the DB
    // (each mutation already syncs), so we don't also write the cloud set locally.
    if (!cloud.value)
      persistLocal(decks.value)
  }

  function refresh() {
    if (!cloud.value) {
      decks.value = loadLocal()
      ready.value = true
    }
  }

  /**
   * Pull the signed-in user's decks from the server. NOT a blind replace: a
   * create/edit whose background write (see createDeck/updateDeck) hasn't
   * landed on the server yet must not be wiped out by this snapshot merely
   * because it re-runs (e.g. a login/logout toggle within the same session).
   * We keep the local copy of any deck that's newer than (or absent from)
   * the server's response, and take the server's copy otherwise.
   *
   * This does not protect a not-yet-synced create/edit across a hard page
   * reload (in-memory state is gone at that point) — closing that gap fully
   * would need a persisted, per-account write queue, which is out of scope here.
   */
  async function syncFromCloud() {
    if (!cloud.value)
      return
    try {
      const { decks: rows } = await $fetch<{ decks: any[] }>('/api/decks')
      const serverDecks = rows.map(fromRow)
      const serverById = new Map(serverDecks.map(d => [d.id, d]))
      const localOnly = decks.value.filter((d) => {
        const server = serverById.get(d.id)
        return !server || d.updatedAt > server.updatedAt
      })
      const localOnlyIds = new Set(localOnly.map(d => d.id))
      decks.value = [...serverDecks.filter(d => !localOnlyIds.has(d.id)), ...localOnly]
    }
    finally {
      // Mark ready even on failure so the UI doesn't hang on a spinner; a
      // failed fetch leaves the (possibly empty) set and the guard proceeds.
      ready.value = true
    }
  }

  /** On first login, push any guest (localStorage) decks to the cloud once. */
  async function migrateLocalToCloud() {
    if (!cloud.value)
      return
    const local = loadLocal()
    if (!local.length)
      return
    // Track which decks actually persisted; only those may be dropped locally.
    // A failed POST must NOT delete its local copy (that would lose the deck).
    const remaining: Deck[] = []
    for (const d of local) {
      try {
        await $fetch('/api/decks', { method: 'POST', body: { id: d.id, name: d.name, raw: d.raw, source: d.source } })
      }
      catch {
        remaining.push(d) // keep locally so a later login can retry the migration
      }
    }
    if (remaining.length)
      persistLocal(remaining)
    else
      localStorage.removeItem(STORAGE_KEY)
    await syncFromCloud()
  }

  function getDeck(id: string): Deck | undefined {
    return decks.value.find(d => d.id === id)
  }

  function createDeck(name: string, raw = '', source?: string): Deck {
    const now = Date.now()
    const deck: Deck = { id: genId(), name: name.trim() || 'Nouveau deck', raw, source, createdAt: now, updatedAt: now }
    decks.value = [deck, ...decks.value]
    persist()
    if (cloud.value) {
      $fetch('/api/decks', { method: 'POST', body: { id: deck.id, name: deck.name, raw, source } })
        .catch(reportSaveFailure)
    }
    return deck
  }

  function updateDeck(id: string, patch: Partial<Pick<Deck, 'name' | 'raw' | 'source'>>) {
    const idx = decks.value.findIndex(d => d.id === id)
    const existing = idx === -1 ? undefined : decks.value[idx]
    if (!existing)
      return
    // No-op when nothing actually changed (e.g. opening a deck and re-saving).
    const unchanged = (Object.keys(patch) as (keyof typeof patch)[]).every(k => patch[k] === existing[k])
    if (unchanged)
      return
    decks.value[idx] = { ...existing, ...patch, updatedAt: Date.now() }
    decks.value = [...decks.value]
    persist()
    if (cloud.value) {
      $fetch(`/api/decks/${id}`, { method: 'PATCH', body: patch })
        .catch(reportSaveFailure)
    }
  }

  function deleteDeck(id: string) {
    decks.value = decks.value.filter(d => d.id !== id)
    persist()
    if (cloud.value) {
      $fetch(`/api/decks/${id}`, { method: 'DELETE' })
        .catch(reportSaveFailure)
    }
  }

  function duplicateDeck(id: string): Deck | undefined {
    const original = getDeck(id)
    if (!original)
      return
    return createDeck(`${original.name} (copie)`, original.raw, original.source)
  }

  /** Enable/disable a public share link; returns the share token (or null). */
  async function setShare(id: string, enabled: boolean): Promise<string | null> {
    if (!cloud.value)
      return null
    const { shareId } = await $fetch<{ shareId: string | null }>(`/api/decks/${id}/share`, { method: 'POST', body: { enabled } })
    const idx = decks.value.findIndex(d => d.id === id)
    if (idx !== -1) {
      const existing = decks.value[idx]
      decks.value[idx] = { ...existing, shareId, ...(enabled ? {} : { public: false }) } as Deck
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
      const existing = decks.value[idx]
      decks.value[idx] = { ...existing, shareId: res.shareId, public: res.public } as Deck
      decks.value = [...decks.value]
    }
    return res.public
  }

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
}
