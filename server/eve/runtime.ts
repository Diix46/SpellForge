import type Anthropic from '@anthropic-ai/sdk'
// Eve session runtime — in-memory, in-process. Owns the lifecycle the front
// (useCoach.ts) expects: a POST starts a turn and returns {sessionId,
// continuationToken}; a GET streams that turn's NDJSON events.
//
// • A CONVERSATION is keyed by continuationToken and holds the running Anthropic
//   message history, so multi-turn chat keeps context without re-sending it.
// • A SESSION is one turn: it has a buffer of NDJSON events the orchestrator
//   emits, and a "done" flag. The stream replays buffered events then live ones.
//
// Everything lives in memory: a server restart drops in-flight chats (acceptable
// for a coach), and there's a small LRU-ish cap so long-lived processes don't
// leak. The NDJSON event shapes match exactly what useCoach.ts parses.

import { runOrchestrator } from './orchestrator'

interface EveEventEnvelope { type: string, data?: unknown }

interface Session {
  id: string
  conversationId: string
  events: EveEventEnvelope[]
  done: boolean
  /** Resolves whenever new events are pushed or the turn ends — lets the stream wait. */
  waiters: Array<() => void>
  createdAt: number
}

interface Conversation {
  id: string
  history: Anthropic.MessageParam[]
  lastUsed: number
}

const sessions = new Map<string, Session>()
const conversations = new Map<string, Conversation>()
const MAX_CONVERSATIONS = 200
const MAX_SESSIONS = 400
const CONVERSATION_TTL_MS = 30 * 60_000 // 30 min idle

// Monotonic counter for ids — avoids Math.random()/Date.now() (unavailable in
// some sandboxes) while staying unique within a process.
let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}_${counter.toString(36)}_${(counter * 2654435761 % 0xFFFFFFFF).toString(36)}`
}

function evictIfNeeded() {
  if (conversations.size > MAX_CONVERSATIONS) {
    const oldest = [...conversations.values()].sort((a, b) => a.lastUsed - b.lastUsed)[0]
    if (oldest)
      conversations.delete(oldest.id)
  }
  if (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.values()].sort((a, b) => a.createdAt - b.createdAt)[0]
    if (oldest)
      sessions.delete(oldest.id)
  }
}

function getConversation(token: string | undefined, now: number): Conversation {
  if (token) {
    const existing = conversations.get(token)
    if (existing && now - existing.lastUsed < CONVERSATION_TTL_MS) {
      existing.lastUsed = now
      return existing
    }
  }
  const conv: Conversation = { id: nextId('conv'), history: [], lastUsed: now }
  conversations.set(conv.id, conv)
  return conv
}

// Wake everyone waiting on this session (new events or completion).
function wake(session: Session) {
  const waiters = session.waiters
  session.waiters = []
  for (const w of waiters)
    w()
}

function push(session: Session, ev: EveEventEnvelope) {
  session.events.push(ev)
  wake(session)
}

export interface StartResult { sessionId: string, continuationToken: string }

/**
 * Begin one coach turn. Appends the user message to the (new or resumed)
 * conversation, starts the orchestrator in the background, and returns the
 * handles the front needs immediately. The turn streams via streamSession().
 *
 * `now` is passed in (callers use Date.now()) to keep this module free of the
 * forbidden time/random globals.
 */
export function startSession(message: string, continuationToken: string | undefined, now: number): StartResult {
  const conv = getConversation(continuationToken, now)
  // The first turn's message already carries the fenced <deck_data> preamble from
  // the client. Extract it as the per-turn deckContext the specialists receive.
  const deckMatch = message.match(/<deck_data>[\s\S]*?<\/deck_data>/)
  const deckContext = deckMatch ? deckMatch[0] : ''

  conv.history.push({ role: 'user', content: message })

  const session: Session = {
    id: nextId('sess'),
    conversationId: conv.id,
    events: [],
    done: false,
    waiters: [],
    createdAt: now,
  }
  sessions.set(session.id, session)
  evictIfNeeded()

  // Run the orchestrator in the background; it emits events into the session
  // buffer. The stream endpoint drains them. We snapshot history for the run and
  // commit the assistant reply back to the conversation on success.
  const historyForRun = [...conv.history]
  ;(async () => {
    try {
      const finalText = await runOrchestrator(historyForRun, deckContext, (ev) => {
        switch (ev.type) {
          case 'text':
            push(session, { type: 'message.appended', data: { messageSoFar: ev.soFar, messageDelta: ev.delta } })
            break
          case 'tool':
            push(session, { type: 'actions.requested', data: { actions: [{ toolName: ev.name }] } })
            break
          case 'status':
            push(session, { type: 'status', data: { label: ev.label } })
            break
          case 'done':
            push(session, { type: 'message.completed', data: { message: ev.message } })
            break
          case 'error':
            push(session, { type: 'turn.failed', data: { message: ev.message } })
            break
        }
      })
      // Persist the assistant turn so the next message keeps context.
      conv.history.push({ role: 'assistant', content: finalText })
      conv.lastUsed = now
    }
    catch (err) {
      push(session, { type: 'turn.failed', data: { message: err instanceof Error ? err.message : 'turn failed' } })
    }
    finally {
      session.done = true
      wake(session)
    }
  })()

  return { sessionId: session.id, continuationToken: conv.id }
}

/**
 * Stream a session's events as NDJSON. Replays anything already buffered, then
 * waits for new events until the turn is done. Safe to call once per turn.
 */
export function streamSession(sessionId: string): ReadableStream<Uint8Array> | null {
  const session = sessions.get(sessionId)
  if (!session)
    return null
  const encoder = new TextEncoder()
  let cursor = 0

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      // Flush all buffered events from the cursor.
      while (cursor < session.events.length) {
        const ev = session.events[cursor++]
        controller.enqueue(encoder.encode(`${JSON.stringify(ev)}\n`))
      }
      if (session.done) {
        controller.close()
        sessions.delete(sessionId) // one-shot: free it once drained
        return
      }
      // Nothing new yet — wait for the next push (or completion).
      await new Promise<void>(resolve => session.waiters.push(resolve))
    },
  })
}
