import type { Outbox } from '#shared/deckOutbox'
import type { StoredDeck } from '#shared/decks'
import type { GameId } from '#shared/game'
import { computed } from 'vue'
import { useState } from '#app'
import { applyOutbox, lastSeq, outboxKey, parseOutbox, queueDelete, queueUpsert, settle } from '#shared/deckOutbox'
import { GUEST_DECKS_V1, GUEST_DECKS_V2, normalizeDeck, readGuestDecks } from '#shared/decks'

export type Deck = StoredDeck

export interface NewDeck {
  name: string
  game: GameId
  raw?: string
  source?: string
}

function genId(): string {
  return `d_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

// ---- Guest decks (localStorage) ----

/**
 * Guest decks, migrating a pre-One Piece list (v1) on first read. v2 is written
 * before v1 is removed, so an interrupted migration loses nothing.
 */
function loadLocal(): Deck[] {
  if (import.meta.server)
    return []
  try {
    const { decks, migrate } = readGuestDecks(localStorage.getItem(GUEST_DECKS_V1), localStorage.getItem(GUEST_DECKS_V2))
    if (migrate) {
      localStorage.setItem(GUEST_DECKS_V2, JSON.stringify(decks))
      localStorage.removeItem(GUEST_DECKS_V1)
    }
    return decks
  }
  catch {
    // Storage blocked (private mode, site data disabled): run without it.
    return []
  }
}

/**
 * Applies one change to what is stored now, not to this tab's copy: another
 * tab may have added or removed decks since this one loaded.
 */
function writeLocal(change: (stored: Deck[]) => Deck[]) {
  if (import.meta.server)
    return
  try {
    const next = change(loadLocal())
    if (next.length)
      localStorage.setItem(GUEST_DECKS_V2, JSON.stringify(next))
    else localStorage.removeItem(GUEST_DECKS_V2)
    localStorage.removeItem(GUEST_DECKS_V1)
  }
  catch {
    // Storage blocked or full: the deck lives in memory for this visit.
  }
}

function upsertIn(list: Deck[], deck: Deck) {
  return list.some(d => d.id === deck.id) ? list.map(d => (d.id === deck.id ? deck : d)) : [deck, ...list]
}

// ---- Account decks: writes go through a durable outbox ----

function readOutbox(userId: string): Outbox {
  try {
    return parseOutbox(localStorage.getItem(outboxKey(userId)))
  }
  catch {
    return {}
  }
}

function writeOutbox(userId: string, outbox: Outbox) {
  try {
    if (Object.keys(outbox).length)
      localStorage.setItem(outboxKey(userId), JSON.stringify(outbox))
    else localStorage.removeItem(outboxKey(userId))
  }
  catch {
    // Without storage the outbox only lasts for this visit.
  }
}

const RETRY_MS = [1000, 4000, 15000]
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const statusOf = (err: unknown) => (err as { statusCode?: number } | null)?.statusCode
// Module state: one sender per browser tab, whatever calls the store.
let seq = 0
const sending = new Set<string>()
const resend = new Set<string>()

function deckBody(deck: Deck) {
  return { name: deck.name, game: deck.game, raw: deck.raw, source: deck.source ?? null, createdAt: deck.createdAt, updatedAt: deck.updatedAt }
}

export function useDeckStore() {
  // Shared singleton. A guest starts from localStorage; an account from the
  // server (see syncFromCloud), with its unsent writes laid on top.
  const decks = useState<Deck[]>('decks', loadLocal)
  const { loggedIn, user } = useUserSession()
  const { t } = useLocale()
  const toast = useToast()

  const cloud = computed(() => loggedIn.value)
  const userId = computed(() => (user.value as { id?: string } | null)?.id ?? null)
  // Has the store finished its initial load? Immediate for guests; for an
  // account only once its decks arrived. The deck pages must not conclude
  // "deck not found" before that.
  const ready = useState<boolean>('decks-ready', () => !loggedIn.value)
  // The last attempt to load the account's decks failed.
  const syncFailed = useState('decks-sync-failed', () => false)

  function setLocal(list: Deck[]) {
    decks.value = list
  }

  function refresh() {
    if (!cloud.value) {
      decks.value = loadLocal()
      ready.value = true
    }
  }

  /**
   * Sends the queued write of one deck, retrying a few times. A deck being
   * sent is not sent twice at once: a newer write waits and goes right after.
   */
  async function send(id: string) {
    const uid = userId.value
    if (!uid)
      return
    if (sending.has(id)) {
      resend.add(id)
      return
    }
    sending.add(id)
    try {
      for (let attempt = 0; ; attempt++) {
        const entry = readOutbox(uid)[id]
        if (!entry)
          return
        try {
          if (entry.kind === 'delete') {
            await $fetch(`/api/decks/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((err) => {
              // Already gone is what we wanted.
              if (statusOf(err) !== 404)
                throw err
            })
          }
          else {
            await $fetch(`/api/decks/${encodeURIComponent(id)}`, { method: 'PUT', body: deckBody(entry.deck) })
          }
          writeOutbox(uid, settle(readOutbox(uid), id, entry.seq))
          if (!resend.delete(id))
            return
          // A newer write arrived meanwhile: send it with fresh retries.
          attempt = -1
        }
        catch (err) {
          const status = statusOf(err)
          // The server refuses this deck for good (bad input, id taken): stop
          // retrying it, and say so.
          if (status === 400 || status === 409 || status === 401 || attempt >= RETRY_MS.length) {
            if (status === 400 || status === 409)
              writeOutbox(uid, settle(readOutbox(uid), id, entry.seq))
            toast.add({
              title: t('toast.saveFailed'),
              description: status === 400 || status === 409 ? t('toast.saveRefused') : t('toast.saveFailedDesc'),
              color: 'error',
              icon: 'i-lucide-cloud-off',
              ...(status === 400 || status === 409
                ? {}
                : { actions: [{ label: t('toast.retry'), onClick: () => { void send(id) } }] }),
            })
            return
          }
          await wait(RETRY_MS[attempt]!)
        }
      }
    }
    finally {
      sending.delete(id)
    }
  }

  function queue(change: (outbox: Outbox) => Outbox, id: string) {
    const uid = userId.value
    if (!uid)
      return
    writeOutbox(uid, change(readOutbox(uid)))
    void send(id)
  }

  function nextSeq(uid: string) {
    seq = Math.max(seq, lastSeq(readOutbox(uid))) + 1
    return seq
  }

  /** Sends every write left from an earlier visit or a failed attempt. */
  async function flushOutbox() {
    const uid = userId.value
    if (!uid)
      return
    await Promise.all(Object.keys(readOutbox(uid)).map(send))
  }

  /**
   * Loads the account's decks: first whatever this browser still has to send,
   * then the server list with the writes that did not get through on top, so a
   * deck edited offline never reverts.
   */
  async function syncFromCloud() {
    const uid = userId.value
    if (!cloud.value || !uid)
      return
    try {
      // Not awaited: a write stuck in retries must not hold the list back;
      // pending writes are laid over the server list below anyway.
      void flushOutbox()
      const { decks: rows } = await $fetch<{ decks: unknown[] }>('/api/decks')
      const server = rows.map(normalizeDeck).filter((d): d is Deck => d !== null)
      decks.value = applyOutbox(server, readOutbox(uid))
      syncFailed.value = false
    }
    catch (err) {
      console.error('[decks] sync failed', err)
      syncFailed.value = true
      // What this browser knows is better than an empty list.
      decks.value = applyOutbox(decks.value, readOutbox(uid))
    }
    finally {
      ready.value = true
    }
  }

  /**
   * On sign-in, moves this browser's guest decks to the account, with their
   * dates. Only the decks the server took leave the browser; an id another
   * account already uses gets a new one.
   */
  async function migrateLocalToCloud() {
    if (!cloud.value)
      return
    const local = loadLocal()
    if (!local.length)
      return
    const moved = new Set<string>()
    for (const d of local) {
      try {
        await $fetch(`/api/decks/${encodeURIComponent(d.id)}`, { method: 'PUT', body: deckBody(d) })
        moved.add(d.id)
      }
      catch (err) {
        if (statusOf(err) !== 409)
          continue
        try {
          await $fetch(`/api/decks/${encodeURIComponent(genId())}`, { method: 'PUT', body: deckBody(d) })
          moved.add(d.id)
        }
        catch {
          // Kept in the browser; the next sign-in tries again.
        }
      }
    }
    writeLocal(stored => stored.filter(d => !moved.has(d.id)))
  }

  function getDeck(id: string): Deck | undefined {
    return decks.value.find(d => d.id === id)
  }

  function save(deck: Deck) {
    setLocal(upsertIn(decks.value, deck))
    if (cloud.value) {
      const uid = userId.value
      if (uid)
        queue(outbox => queueUpsert(outbox, deck, nextSeq(uid)), deck.id)
    }
    else {
      writeLocal(stored => upsertIn(stored, deck))
    }
  }

  function createDeck({ name, game, raw = '', source }: NewDeck): Deck {
    const now = Date.now()
    const deck: Deck = { id: genId(), name: name.trim() || t('nav.newDeck'), game, raw, createdAt: now, updatedAt: now }
    if (source)
      deck.source = source
    save(deck)
    return deck
  }

  function updateDeck(id: string, patch: Partial<Pick<Deck, 'name' | 'raw' | 'source'>>) {
    const existing = getDeck(id)
    if (!existing)
      return
    // No-op when nothing actually changed (e.g. opening a deck and re-saving).
    const unchanged = (Object.keys(patch) as (keyof typeof patch)[]).every(k => patch[k] === existing[k])
    if (unchanged)
      return
    save({ ...existing, ...patch, updatedAt: Math.max(Date.now(), existing.updatedAt + 1) })
  }

  function deleteDeck(id: string) {
    setLocal(decks.value.filter(d => d.id !== id))
    if (cloud.value) {
      const uid = userId.value
      if (uid)
        queue(outbox => queueDelete(outbox, id, nextSeq(uid)), id)
    }
    else {
      writeLocal(stored => stored.filter(d => d.id !== id))
    }
  }

  function duplicateDeck(id: string): Deck | undefined {
    const original = getDeck(id)
    if (!original)
      return
    return createDeck({ name: `${original.name} ${t('deck.copySuffix')}`, game: original.game, raw: original.raw, source: original.source })
  }

  /**
   * Share settings only exist for a deck the server has: its pending write is
   * sent first, so a deck created a second ago can be shared at once.
   */
  async function ensureSaved(id: string) {
    const uid = userId.value
    if (uid && readOutbox(uid)[id])
      await send(id)
  }

  function patchLocal(id: string, patch: Partial<Deck>) {
    const existing = getDeck(id)
    if (existing)
      setLocal(upsertIn(decks.value, { ...existing, ...patch }))
  }

  /** Enable/disable a public share link; returns the share token (or null). */
  async function setShare(id: string, enabled: boolean): Promise<string | null> {
    if (!cloud.value)
      return null
    await ensureSaved(id)
    const { shareId } = await $fetch<{ shareId: string | null }>(`/api/decks/${encodeURIComponent(id)}/share`, { method: 'POST', body: { enabled } })
    patchLocal(id, { shareId, ...(enabled ? {} : { public: false }) })
    return shareId
  }

  /** Enable/disable listing this deck in the public Discover gallery. */
  async function setPublic(id: string, enabled: boolean): Promise<boolean> {
    if (!cloud.value)
      return false
    await ensureSaved(id)
    const res = await $fetch<{ shareId: string | null, public: boolean }>(`/api/decks/${encodeURIComponent(id)}/publish`, { method: 'POST', body: { enabled } })
    patchLocal(id, { shareId: res.shareId, public: res.public })
    return res.public
  }

  return {
    decks,
    cloud,
    ready,
    syncFailed,
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
