import type { CoachMessage } from '~/composables/useCoach'
import { useState } from 'nuxt/app'
import { watch } from 'vue'

// Global Coach conversation history (all decks). Each conversation is stored with
// the deck it was about, so the player can reopen past exchanges from any deck.
// Persisted to localStorage; shared via useState so every component sees the same
// list. useCoach owns the ACTIVE conversation and writes its settled state here.

export interface CoachConversation {
  id: string
  /** Short title (first user question, trimmed). */
  title: string
  /** Deck this conversation was about (label + id for the chip). */
  deckName: string
  deckId: string
  messages: CoachMessage[]
  /** Eve continuation token to resume the multi-turn session. */
  continuationToken: string
  /** Last-updated timestamp (ms) for sorting. */
  updatedAt: number
}

const HISTORY_KEY = 'spellforge-coach-history'
const ACTIVE_KEY = 'spellforge-coach-active'
const LEGACY_KEY = 'spellforge-coach' // pre-history single-conversation store
const MAX_CONVERSATIONS = 50

// One-time migration of the old single-conversation localStorage into a history
// entry, so upgrading users keep their last chat. Removes the legacy key after.
function migrateLegacy(): CoachConversation | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw)
      return null
    localStorage.removeItem(LEGACY_KEY)
    const data = JSON.parse(raw) as { messages?: CoachMessage[], continuationToken?: string }
    const messages = (data.messages ?? []).filter(m => m.text)
    if (!messages.length)
      return null
    const firstUser = messages.find(m => m.role === 'user')
    return {
      id: 'legacy',
      title: (firstUser?.text ?? 'Conversation').replace(/\s+/g, ' ').trim().slice(0, 60),
      deckName: '',
      deckId: '',
      messages,
      continuationToken: data.continuationToken ?? '',
      updatedAt: 0,
    }
  }
  catch {
    return null
  }
}

function loadList(): CoachConversation[] {
  if (!import.meta.client)
    return []
  let list: CoachConversation[] = []
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) {
      const data = JSON.parse(raw) as CoachConversation[]
      list = Array.isArray(data) ? data : []
    }
  }
  catch {
    list = []
  }
  const legacy = migrateLegacy()
  if (legacy && !list.some(c => c.id === 'legacy'))
    list.push(legacy)
  return list
}

function loadActiveId(): string {
  if (!import.meta.client)
    return ''
  try {
    return localStorage.getItem(ACTIVE_KEY) ?? ''
  }
  catch {
    return ''
  }
}

export function useCoachHistory() {
  const conversations = useState<CoachConversation[]>('coach-history', loadList)
  const activeId = useState('coach-active-id', loadActiveId)

  if (import.meta.client) {
    watch(conversations, (list) => {
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
      }
      catch {}
    }, { deep: true })
    watch(activeId, (id) => {
      try {
        localStorage.setItem(ACTIVE_KEY, id)
      }
      catch {}
    })
  }

  /** Insert or update a conversation (keyed by id); keeps the list sorted + capped. */
  function upsert(conv: CoachConversation) {
    const list = conversations.value.filter(c => c.id !== conv.id)
    list.unshift(conv)
    list.sort((a, b) => b.updatedAt - a.updatedAt)
    conversations.value = list.slice(0, MAX_CONVERSATIONS)
  }

  function remove(id: string) {
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (activeId.value === id)
      activeId.value = ''
  }

  function get(id: string): CoachConversation | undefined {
    return conversations.value.find(c => c.id === id)
  }

  return { conversations, activeId, upsert, remove, get }
}
