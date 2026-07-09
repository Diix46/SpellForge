// Shared Scryfall client for the Nitro server routes. Before this, the
// User-Agent string was copy-pasted into 7 routes and the collection endpoint
// into 3 — a UA/contact bump meant editing every file. Centralised here:
//   - SCRYFALL_* endpoint constants + the UA,
//   - scryfallFetch(): one fetch with the right headers + a uniform 502 on error,
//   - resolveScryfallByName(): the chunk-by-75 /cards/collection batch loop that
//     suggest.post.ts and cards/search.get.ts each used to reimplement.
// Files in server/utils are auto-imported by Nitro, so routes use these directly.

export const SCRYFALL_UA = 'Spellforge/0.1 (deckbuilder; contact: spellforge.app)'
export const SCRYFALL_SEARCH = 'https://api.scryfall.com/cards/search'
export const SCRYFALL_COLLECTION = 'https://api.scryfall.com/cards/collection'
export const SCRYFALL_CARDS = 'https://api.scryfall.com/cards'
export const SCRYFALL_AUTOCOMPLETE = 'https://api.scryfall.com/cards/autocomplete'

/**
 * Sanitize a card name for embedding in a Scryfall `!"name"` exact-match
 * clause: strip quotes/backslashes (either would break out of the quoted
 * clause and produce an invalid query) and trim whitespace. Mirrors the
 * client copy in app/composables/scryfall/helpers.ts — small utils are
 * intentionally duplicated across the client/server boundary in this codebase
 * (see getImageUris below for the same pattern) rather than shared.
 */
export function sanitizeCardName(name: string): string {
  return name.replace(/["\\]/g, '').trim()
}

/**
 * Scryfall's image-uris object. A superset of the sizes the various routes read
 * (each route only touches the ones it needs); all optional so this one type fits
 * every consumer (prints thumbnails, landing art-crops, etc.).
 */
export interface ScryImg {
  small?: string
  normal?: string
  large?: string
  png?: string
  art_crop?: string
}

/**
 * The image_uris for a card, falling back to the first face (DFCs carry their
 * art per-face, not on the card root). Mirrors the client helper of the same
 * name — the two copies are intentional (no shared client/server boundary).
 */
export function getImageUris(
  card: { image_uris?: ScryImg, card_faces?: Array<{ image_uris?: ScryImg }> } | null | undefined,
): ScryImg | undefined {
  return card?.image_uris ?? card?.card_faces?.[0]?.image_uris
}

// Scryfall caps a /cards/collection request at 75 identifiers.
export const SCRYFALL_COLLECTION_CHUNK = 75

/**
 * Fetch from Scryfall with the standard headers. For GET, pass nothing extra;
 * for the collection POST pass `{ method: 'POST', json: { identifiers } }` and
 * the JSON body + Content-Type are set for you. Returns the raw Response — the
 * caller decides how to treat 404 (Scryfall uses it for "no match", which is
 * often a valid empty answer, not an error).
 */
// A hung upstream call (Scryfall having a bad day) must not hang the whole
// Nitro route indefinitely — every caller gets the same bounded wait.
const SCRYFALL_TIMEOUT_MS = 10_000

export function scryfallFetch(url: string, opts: { method?: string, json?: unknown } = {}): Promise<Response> {
  const headers: Record<string, string> = { 'User-Agent': SCRYFALL_UA, 'Accept': 'application/json' }
  const init: RequestInit = { method: opts.method ?? 'GET', headers, signal: AbortSignal.timeout(SCRYFALL_TIMEOUT_MS) }
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.json)
  }
  return fetch(url, init)
}

/**
 * Resolve a list of card names to their Scryfall cards via /cards/collection,
 * in chunks of 75. Returns a Map keyed by lowercased name. Best-effort: a failed
 * or non-ok chunk is skipped (those names are simply absent from the map), so the
 * caller falls back gracefully. `T` lets callers pin the shape they read back
 * (e.g. just { name, prices } for price enrichment, or the identity/legality
 * fields for the AI validation gate).
 */
export async function resolveScryfallByName<T extends { name?: string }>(names: string[]): Promise<Map<string, T>> {
  const byName = new Map<string, T>()
  const unique = [...new Set(names.map(n => n.trim()).filter(Boolean))]
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += SCRYFALL_COLLECTION_CHUNK)
    chunks.push(unique.slice(i, i + SCRYFALL_COLLECTION_CHUNK))

  // Chunks are independent /cards/collection calls — run them concurrently
  // instead of one after another. A big decklist's first open could previously
  // trigger several sequential round-trips here (~400ms each).
  await Promise.all(chunks.map(async (chunk) => {
    const identifiers = chunk.map(name => ({ name }))
    try {
      const res = await scryfallFetch(SCRYFALL_COLLECTION, { method: 'POST', json: { identifiers } })
      if (!res.ok)
        return
      const data = await res.json() as { data?: T[] }
      for (const c of data.data ?? []) {
        if (c.name)
          byName.set(c.name.toLowerCase(), c)
      }
    }
    catch {
      // Best-effort: a failed chunk just leaves those names unresolved.
    }
  }))
  return byName
}
