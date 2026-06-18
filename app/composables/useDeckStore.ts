import { useState } from '#app'

export interface Deck {
  id: string
  name: string
  raw: string
  source?: string
  createdAt: number
  updatedAt: number
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
  }
}

export function useDeckStore() {
  // SSR-safe shared singleton; starts from localStorage (guest), replaced by
  // cloud decks once signed in (see syncFromCloud / migrateLocalToCloud).
  const decks = useState<Deck[]>('decks', loadLocal)
  const { loggedIn } = useUserSession()
  // True once we're operating against the cloud (signed in). Guest = local only.
  const cloud = computed(() => loggedIn.value)

  function persist() {
    // Guests persist to localStorage; signed-in users' source of truth is the DB
    // (each mutation already syncs), so we don't also write the cloud set locally.
    if (!cloud.value)
      persistLocal(decks.value)
  }

  function refresh() {
    if (!cloud.value)
      decks.value = loadLocal()
  }

  /** Pull the signed-in user's decks from the server (replaces the local set). */
  async function syncFromCloud() {
    if (!cloud.value)
      return
    const { decks: rows } = await $fetch<{ decks: any[] }>('/api/decks')
    decks.value = rows.map(fromRow)
  }

  /** On first login, push any guest (localStorage) decks to the cloud once. */
  async function migrateLocalToCloud() {
    if (!cloud.value)
      return
    const local = loadLocal()
    if (!local.length)
      return
    for (const d of local) {
      await $fetch('/api/decks', { method: 'POST', body: { id: d.id, name: d.name, raw: d.raw, source: d.source } }).catch(() => {})
    }
    localStorage.removeItem(STORAGE_KEY) // migrated — avoid re-importing
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
    if (cloud.value)
      $fetch('/api/decks', { method: 'POST', body: { id: deck.id, name: deck.name, raw, source } }).catch(() => {})
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
    if (cloud.value)
      $fetch(`/api/decks/${id}`, { method: 'PATCH', body: patch }).catch(() => {})
  }

  function deleteDeck(id: string) {
    decks.value = decks.value.filter(d => d.id !== id)
    persist()
    if (cloud.value)
      $fetch(`/api/decks/${id}`, { method: 'DELETE' }).catch(() => {})
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
    return shareId
  }

  return {
    decks,
    cloud,
    refresh,
    syncFromCloud,
    migrateLocalToCloud,
    getDeck,
    createDeck,
    updateDeck,
    deleteDeck,
    duplicateDeck,
    setShare,
  }
}
