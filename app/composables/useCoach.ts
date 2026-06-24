import { useState } from 'nuxt/app'
import { watch } from 'vue'
import { useCoachHistory } from '~/composables/useCoachHistory'

// Conversational AI deck Coach, backed by the Eve agent service (proxied through
// /api/coach/*). Streams the assistant reply token-by-token and surfaces the
// tool activity (Scryfall / EDHREC / validation) so the user sees it reasoning
// over real data, not guessing.
//
// State is shared (useState) so the chat survives navigation. The conversation
// list (all decks) lives in useCoachHistory + localStorage; this composable owns
// the ACTIVE conversation and mirrors its settled state into that store.

export interface CoachMessage {
  role: 'user' | 'assistant'
  text: string
  /** Short labels of tools the assistant used while producing this reply. */
  tools?: string[]
  /** Transient activity line shown while the agent works ("consulting…"). */
  statusLine?: string
  pending?: boolean
}

// Map raw tool names to friendly activity labels. Two kinds: the real-data tools
// (Scryfall/EDHREC/validate) and the consult_<domain> tools — each consult names
// one of the Coach's specialists, so the player sees the expert team at work.
const TOOL_LABEL: Record<string, string> = {
  scryfall_search: '🔍 Recherche de cartes (Scryfall)',
  edhrec_suggestions: '📊 Cartes populaires (EDHREC)',
  validate_cards: '✅ Vérification des cartes',
  consult_ramp: '🌿 Spécialiste rampe & mana',
  consult_draw: '🃏 Spécialiste pioche',
  consult_removal: '🎯 Spécialiste removal & interaction',
  consult_curve: '📈 Spécialiste courbe de mana',
  consult_legality: '🛡️ Gardien légalité & identité',
  consult_budget: '💰 Spécialiste budget',
}
function toolLabel(name: string): string {
  if (TOOL_LABEL[name])
    return TOOL_LABEL[name]
  // Unknown consult_<x> → a generic specialist label rather than the raw tool id.
  if (name.startsWith('consult_'))
    return `🧠 Spécialiste ${name.slice('consult_'.length)}`
  return name
}

interface CoachActionCall { toolName?: string, name?: string }
type CoachEvent
  = | { type: 'message.appended', data?: { messageSoFar?: string, messageDelta?: string } }
    | { type: 'message.completed', data?: { message?: string } }
    | { type: 'actions.requested', data?: { actions?: CoachActionCall[], requests?: CoachActionCall[], toolCalls?: CoachActionCall[] } }
    | { type: 'status', data?: { label?: string } }
    | { type: 'step.failed' | 'turn.failed' | 'session.failed', data?: { message?: string } }
    // Catch-all for event types we don't act on (kept distinct so the cases above narrow).
    | { type: 'other', data?: unknown }

interface CoachPersist { messages: CoachMessage[], continuationToken: string }
// Legacy single-conversation key (pre-history). On first load we migrate it into
// the new history store (see migrateLegacy) and then start from a clean slate;
// the active conversation now always begins empty (the list holds the past).
function loadPersisted(): CoachPersist {
  return { messages: [], continuationToken: '' }
}

const EXPAND_KEY = 'spellforge-coach-expanded'
function loadExpanded(): boolean {
  if (!import.meta.client)
    return false
  try {
    return localStorage.getItem(EXPAND_KEY) === '1'
  }
  catch {
    return false
  }
}

// Monotonic-ish id for a new conversation (client time + counter is fine here).
let convCounter = 0
function newConvId(): string {
  convCounter += 1
  return `c_${Date.now().toString(36)}_${convCounter.toString(36)}`
}

export function useCoach() {
  // Shared across every component that calls useCoach() in this session.
  const messages = useState<CoachMessage[]>('coach-messages', () => loadPersisted().messages)
  const streaming = useState('coach-streaming', () => false)
  const error = useState('coach-error', () => '')
  const tokenState = useState('coach-token', () => loadPersisted().continuationToken)
  // Large-panel toggle (shared so the header button in CoachChat and the
  // .coach-panel sizing in the deck page stay in sync). Persisted across reloads.
  const expanded = useState('coach-expanded', loadExpanded)
  if (import.meta.client) {
    watch(expanded, (v) => {
      try {
        localStorage.setItem(EXPAND_KEY, v ? '1' : '0')
      }
      catch {}
    })
  }

  const history = useCoachHistory()
  // The deck of the ACTIVE conversation — captured on the first send so the
  // history entry is labelled and (re)attaching deck context is correct.
  const activeDeck = useState('coach-active-deck', () => ({ id: '', name: '' }))
  let continuationToken = tokenState.value
  // Lets the consumer abort an in-flight stream (e.g. when the Coach panel is
  // closed) so the fetch/reader is released instead of draining in the
  // background until the Eve session ends.
  let controller: AbortController | null = null

  // Write the active conversation's settled state into the history store. Called
  // at settle points (token received, reply finished) and via the deep watcher.
  function persist() {
    tokenState.value = continuationToken
    if (!import.meta.client)
      return
    const clean = messages.value.filter(m => !m.pending && m.text)
    if (!clean.length)
      return // nothing settled yet — don't create an empty history entry
    let id = history.activeId.value
    if (!id) {
      id = newConvId()
      history.activeId.value = id
    }
    const firstUser = clean.find(m => m.role === 'user')
    const title = (firstUser?.text ?? 'Conversation').replace(/\s+/g, ' ').trim().slice(0, 60)
    // strip transient statusLine before persisting
    const messagesToSave = clean.map(({ statusLine: _s, pending: _p, ...m }) => m)
    history.upsert({
      id,
      title,
      deckName: activeDeck.value.name,
      deckId: activeDeck.value.id,
      messages: messagesToSave,
      continuationToken,
      updatedAt: Date.now(),
    })
  }

  // Mirror settled changes into the store as they happen (covers edits the
  // explicit persist() calls might miss, e.g. a late deep mutation).
  if (import.meta.client) {
    watch(messages, () => persist(), { deep: true })
  }

  /** Cancel any in-flight stream without surfacing an error. */
  function stop() {
    controller?.abort()
    controller = null
    streaming.value = false
  }

  /** Start a fresh, empty conversation (the current one stays in history). */
  function newConversation() {
    stop()
    messages.value = []
    error.value = ''
    continuationToken = ''
    tokenState.value = ''
    history.activeId.value = ''
    activeDeck.value = { id: '', name: '' }
  }

  /** Open a past conversation from history into the active view. */
  function loadConversation(id: string) {
    const conv = history.get(id)
    if (!conv)
      return
    stop()
    error.value = ''
    messages.value = conv.messages.map(m => ({ ...m }))
    continuationToken = conv.continuationToken
    tokenState.value = conv.continuationToken
    history.activeId.value = conv.id
    activeDeck.value = { id: conv.deckId, name: conv.deckName }
  }

  // reset() = start a brand-new conversation (kept for the existing "Nouvelle
  // conversation" button; the previous chat is preserved in history now).
  const reset = newConversation

  /**
   * Send a user message. `deckContext` (a compact deck summary) is prepended to
   * the FIRST message of a conversation so the coach knows the deck. `deckMeta`
   * labels the conversation in history (and binds it to the current deck).
   */
  async function send(userText: string, deckContext?: string, deckMeta?: { id: string, name: string }) {
    if (streaming.value || !userText.trim())
      return
    error.value = ''
    // First message of a new conversation → bind it to the current deck.
    const isFirst = !continuationToken
    if (isFirst && deckMeta)
      activeDeck.value = { id: deckMeta.id, name: deckMeta.name }
    messages.value.push({ role: 'user', text: userText })
    // Push the assistant bubble, then grab the REACTIVE element back out of the
    // shared array — mutating that (not a detached object) is what makes the
    // deep watcher fire and persist the streamed reply to localStorage.
    messages.value.push({ role: 'assistant', text: '', tools: [], pending: true })
    const assistant = { value: messages.value[messages.value.length - 1]! }
    streaming.value = true
    controller = new AbortController()
    const signal = controller.signal

    // Only the first turn carries the deck context preamble. The deck data is
    // user-controlled (deck/card names), so fence it in an explicit data block
    // the agent is told to treat as data, never as instructions — defuses
    // prompt-injection via a crafted deck/card name. (`isFirst` computed above,
    // before the deck binding, so a fresh conversation always carries context.)
    const message = isFirst && deckContext
      ? `<deck_data>\n${deckContext}\n</deck_data>\n\nQuestion du joueur: ${userText}`
      : userText

    try {
      const { sessionId, continuationToken: tok } = await $fetch<{ sessionId: string, continuationToken: string }>(
        '/api/coach/session',
        { method: 'POST', body: { message, continuationToken: continuationToken || undefined } },
      )
      if (tok) {
        continuationToken = tok
        persist()
      }
      if (!sessionId)
        throw new Error('no session id')
      await consumeStream(sessionId, assistant, signal)
    }
    catch (e) {
      // A deliberate stop() (panel closed / reset) isn't an error.
      if (signal.aborted) {
        if (!assistant.value.text)
          messages.value = messages.value.filter(m => m !== assistant.value)
        return
      }
      const err = e as { data?: { statusMessage?: string }, statusMessage?: string, message?: string } | null
      error.value = err?.data?.statusMessage || err?.statusMessage || err?.message || 'Coach indisponible'
      // Drop the empty pending bubble on hard failure.
      if (!assistant.value.text)
        messages.value = messages.value.filter(m => m !== assistant.value)
    }
    finally {
      assistant.value.pending = false
      streaming.value = false
      controller = null
      // Settle point — persist the finished reply (incl. the assistant bubble).
      persist()
    }
  }

  async function consumeStream(sessionId: string, assistant: { value: CoachMessage }, signal: AbortSignal) {
    const res = await fetch(`/api/coach/stream/${encodeURIComponent(sessionId)}`, { signal })
    if (!res.ok || !res.body)
      throw new Error(`stream ${res.status}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    const seenTools = new Set<string>()

    function flush(line: string) {
      const trimmed = line.trim()
      if (!trimmed)
        return
      let ev: CoachEvent
      try {
        ev = JSON.parse(trimmed) as CoachEvent
      }
      catch {
        return
      }
      handleEvent(ev, assistant, seenTools)
    }

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done)
          break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? '' // keep the partial last line
        for (const line of lines)
          flush(line)
      }
      // The last NDJSON event may arrive without a trailing newline — don't
      // drop it (it's often the final message.completed).
      flush(buf)
    }
    finally {
      // Release the reader (and the underlying connection) on completion,
      // error, or abort.
      reader.cancel().catch(() => {})
    }
  }

  function handleEvent(ev: CoachEvent, assistant: { value: CoachMessage }, seenTools: Set<string>) {
    switch (ev?.type) {
      case 'message.appended': {
        // Eve carries the cumulative text in `messageSoFar` (delta in
        // `messageDelta`). Replace with the cumulative — don't concatenate.
        if (typeof ev.data?.messageSoFar === 'string')
          assistant.value.text = ev.data.messageSoFar
        else if (typeof ev.data?.messageDelta === 'string')
          assistant.value.text += ev.data.messageDelta
        // Text is flowing again — clear any transient activity line.
        assistant.value.statusLine = ''
        break
      }
      case 'status': {
        // Transient activity line ("Consultation du spécialiste rampe…").
        assistant.value.statusLine = typeof ev.data?.label === 'string' ? ev.data.label : ''
        break
      }
      case 'message.completed': {
        // Finalised block text lives in `message`.
        const final = typeof ev.data?.message === 'string' ? ev.data.message : ''
        if (final.length >= assistant.value.text.length)
          assistant.value.text = final
        assistant.value.statusLine = ''
        break
      }
      case 'actions.requested': {
        const calls = ev.data?.actions ?? ev.data?.requests ?? ev.data?.toolCalls ?? []
        for (const c of calls) {
          const name = c?.toolName ?? c?.name
          if (name && !seenTools.has(name)) {
            seenTools.add(name)
            ;(assistant.value.tools ??= []).push(toolLabel(name))
          }
        }
        break
      }
      case 'step.failed':
      case 'turn.failed':
      case 'session.failed': {
        if (!assistant.value.text)
          throw new Error(ev.data?.message || 'Coach: échec')
        break
      }
    }
  }

  return {
    messages,
    streaming,
    error,
    expanded,
    // History (all decks) + active conversation controls.
    conversations: history.conversations,
    activeId: history.activeId,
    activeDeck,
    newConversation,
    loadConversation,
    deleteConversation: history.remove,
    send,
    reset,
    stop,
  }
}
