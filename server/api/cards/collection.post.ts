// Proxies Scryfall's /cards/collection (POST) — server-side: avoids the
// browser→Scryfall round trip + CORS, sets a proper UA, and (the point here)
// CACHES the result so opening the same deck again is instant.
//
// Why this matters: the client used to POST identifiers straight to
// api.scryfall.com on every deck open — uncached, ~3s cold. Scryfall's
// collection endpoint is slow when cold but the answer is stable (a given set
// of card identifiers always resolves to the same printings), so it's an ideal
// SWR cache target: the first open eats the latency once, every later open is
// served instantly while a fresh copy is revalidated in the background.
//
// Scryfall caps a collection request at 75 identifiers; the client already
// batches, so each request here is one ≤75 chunk.

import { createHash } from 'node:crypto'

const MAX_IDENTIFIERS = SCRYFALL_COLLECTION_CHUNK

interface Identifier {
  name?: string
  set?: string
  collector_number?: string
}

// Deterministic, order-independent key for a set of identifiers, so the same
// deck (in any entry order) hits the same cache slot.
function keyFor(identifiers: Identifier[]): string {
  const norm = identifiers
    .map(id => (id.set && id.collector_number)
      ? `${id.set.toLowerCase()}/${id.collector_number}`
      : `n:${(id.name ?? '').toLowerCase().trim()}`)
    .sort()
    .join('|')
  return createHash('sha1').update(norm).digest('hex')
}

export default defineCachedEventHandler(async (event): Promise<{ data: unknown[], notFound: unknown[] }> => {
  const body = await readBody<{ identifiers?: Identifier[] }>(event)
  const identifiers = Array.isArray(body?.identifiers) ? body.identifiers.slice(0, MAX_IDENTIFIERS) : []
  if (!identifiers.length)
    return { data: [], notFound: [] }

  const res = await scryfallFetch(SCRYFALL_COLLECTION, { method: 'POST', json: { identifiers } })
  if (!res.ok) {
    // Don't cache failures — throw so the cache write is skipped and a transient
    // Scryfall hiccup isn't pinned for the whole window.
    throw createError({ statusCode: 502, statusMessage: `Scryfall ${res.status}` })
  }

  const json = await res.json() as { data?: unknown[], not_found?: unknown[] }
  return { data: json.data ?? [], notFound: json.not_found ?? [] }
}, {
  // Printings for a fixed identifier set are stable; cache hard with SWR so the
  // 3s cold cost is paid once, then deck opens are instant for ~24h.
  maxAge: 60 * 60,
  staleMaxAge: 60 * 60 * 24,
  swr: true,
  name: 'scryfall-collection',
  getKey: async (event) => {
    // getKey runs before the handler; read+restore the body so the handler can
    // read it again (h3 buffers the raw body, so a second readBody is safe).
    const body = await readBody<{ identifiers?: Identifier[] }>(event).catch(() => null)
    const ids = Array.isArray(body?.identifiers) ? body!.identifiers!.slice(0, MAX_IDENTIFIERS) : []
    return keyFor(ids)
  },
})
