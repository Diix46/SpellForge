import { useState } from 'nuxt/app'
import { watch } from 'vue'

// Conversational AI deck Coach, backed by the Eve agent service (proxied through
// /api/coach/*). Streams the assistant reply token-by-token and surfaces the
// tool activity (Scryfall / EDHREC / validation) so the user sees it reasoning
// over real data, not guessing.
//
// State is shared (useState) so the chat survives navigation, and mirrored to
// localStorage so it also survives a full page reload.

export interface CoachMessage {
  role: 'user' | 'assistant'
  text: string
  /** Short labels of tools the assistant used while producing this reply. */
  tools?: string[]
  pending?: boolean
}

const STORAGE_KEY = 'spellforge-coach'

// Map raw tool names to friendly, localisable activity labels.
const TOOL_LABEL: Record<string, string> = {
  scryfall_search: 'Recherche de cartes (Scryfall)',
  edhrec_suggestions: 'Cartes populaires (EDHREC)',
  validate_cards: 'Vérification des cartes',
}
function toolLabel(name: string): string {
  return TOOL_LABEL[name] ?? name
}

interface CoachPersist { messages: CoachMessage[], continuationToken: string }
function loadPersisted(): CoachPersist {
  if (!import.meta.client)
    return { messages: [], continuationToken: '' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as CoachPersist
      // Drop any half-streamed pending bubble from a previous session.
      const msgs = (data.messages ?? []).filter(m => !m.pending && m.text)
      return { messages: msgs, continuationToken: data.continuationToken ?? '' }
    }
  }
  catch {}
  return { messages: [], continuationToken: '' }
}

export function useCoach() {
  // Shared across every component that calls useCoach() in this session.
  const messages = useState<CoachMessage[]>('coach-messages', () => loadPersisted().messages)
  const streaming = useState('coach-streaming', () => false)
  const error = useState('coach-error', () => '')
  const tokenState = useState('coach-token', () => loadPersisted().continuationToken)
  let continuationToken = tokenState.value
  // Lets the consumer abort an in-flight stream (e.g. when the Coach panel is
  // closed) so the fetch/reader is released instead of draining in the
  // background until the Eve session ends.
  let controller: AbortController | null = null

  // Mirror the conversation to localStorage so it survives a reload. Skip the
  // transient pending bubble — only persist settled text.
  if (import.meta.client) {
    watch(messages, (msgs) => {
      try {
        const clean = msgs.filter(m => !m.pending && m.text)
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: clean, continuationToken }))
      }
      catch {}
    }, { deep: true })
  }
  // Write the current conversation snapshot to localStorage. Called explicitly at
  // settle points (token received, reply finished) so persistence never depends
  // on watcher flush timing for the freshly-streamed assistant bubble.
  function persist() {
    tokenState.value = continuationToken
    if (import.meta.client) {
      try {
        const clean = messages.value.filter(m => !m.pending && m.text)
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: clean, continuationToken }))
      }
      catch {}
    }
  }

  /** Cancel any in-flight stream without surfacing an error. */
  function stop() {
    controller?.abort()
    controller = null
    streaming.value = false
  }

  function reset() {
    stop()
    messages.value = []
    error.value = ''
    continuationToken = ''
    tokenState.value = ''
    if (import.meta.client) {
      try {
        localStorage.removeItem(STORAGE_KEY)
      }
      catch {}
    }
  }

  /**
   * Send a user message. `deckContext` (a compact deck summary) is prepended to
   * the FIRST message of a conversation so the coach knows the deck without a
   * callback into the app.
   */
  async function send(userText: string, deckContext?: string) {
    if (streaming.value || !userText.trim())
      return
    error.value = ''
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
    // the agent is told (in instructions.md) to treat as data, never as
    // instructions — defuses prompt-injection via a crafted deck/card name.
    const isFirst = !continuationToken
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
    catch (e: any) {
      // A deliberate stop() (panel closed / reset) isn't an error.
      if (signal.aborted) {
        if (!assistant.value.text)
          messages.value = messages.value.filter(m => m !== assistant.value)
        return
      }
      error.value = e?.data?.statusMessage || e?.statusMessage || e?.message || 'Coach indisponible'
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
      let ev: any
      try {
        ev = JSON.parse(trimmed)
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

  function handleEvent(ev: any, assistant: { value: CoachMessage }, seenTools: Set<string>) {
    const type: string = ev?.type ?? ''
    const data = ev?.data ?? {}
    switch (type) {
      case 'message.appended': {
        // Eve carries the cumulative text in `messageSoFar` (delta in
        // `messageDelta`). Replace with the cumulative — don't concatenate.
        if (typeof data.messageSoFar === 'string')
          assistant.value.text = data.messageSoFar
        else if (typeof data.messageDelta === 'string')
          assistant.value.text += data.messageDelta
        break
      }
      case 'message.completed': {
        // Finalised block text lives in `message`.
        const final = typeof data.message === 'string' ? data.message : ''
        if (final.length >= assistant.value.text.length)
          assistant.value.text = final
        break
      }
      case 'actions.requested': {
        const calls = data.actions ?? data.requests ?? data.toolCalls ?? []
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
          throw new Error(data?.message || 'Coach: échec')
        break
      }
    }
  }

  return { messages, streaming, error, send, reset, stop }
}
