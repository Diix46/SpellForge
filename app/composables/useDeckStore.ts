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
  return `deck_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function load(): Deck[] {
  if (import.meta.server)
    return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}

function persist(decks: Deck[]) {
  if (import.meta.server)
    return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks))
}

export function useDeckStore() {
  // SSR-safe shared singleton; lazily hydrated from localStorage on the client.
  const decks = useState<Deck[]>('decks', load)

  function refresh() {
    decks.value = load()
  }

  function getDeck(id: string): Deck | undefined {
    return decks.value.find(d => d.id === id)
  }

  function createDeck(name: string, raw = '', source?: string): Deck {
    const now = Date.now()
    const deck: Deck = {
      id: genId(),
      name: name.trim() || 'Nouveau deck',
      raw,
      source,
      createdAt: now,
      updatedAt: now,
    }
    decks.value = [deck, ...decks.value]
    persist(decks.value)
    return deck
  }

  function updateDeck(id: string, patch: Partial<Pick<Deck, 'name' | 'raw' | 'source'>>) {
    const idx = decks.value.findIndex(d => d.id === id)
    const existing = idx === -1 ? undefined : decks.value[idx]
    if (!existing)
      return
    // No-op (and no updatedAt bump / reorder) when nothing actually changed,
    // e.g. merely opening a deck and re-saving identical content.
    const unchanged = (Object.keys(patch) as (keyof typeof patch)[])
      .every(k => patch[k] === existing[k])
    if (unchanged)
      return
    decks.value[idx] = {
      ...existing,
      ...patch,
      updatedAt: Date.now(),
    }
    decks.value = [...decks.value]
    persist(decks.value)
  }

  function deleteDeck(id: string) {
    decks.value = decks.value.filter(d => d.id !== id)
    persist(decks.value)
  }

  function duplicateDeck(id: string): Deck | undefined {
    const original = getDeck(id)
    if (!original)
      return
    return createDeck(`${original.name} (copie)`, original.raw, original.source)
  }

  return {
    decks,
    refresh,
    getDeck,
    createDeck,
    updateDeck,
    deleteDeck,
    duplicateDeck,
  }
}
