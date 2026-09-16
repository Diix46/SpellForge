// Server route to import decklists from external sites (bypasses browser CORS).
// Supports EDHREC (commander average decks + deckpreview pages) and Archidekt
// (public deck pages, via Archidekt's public read API).
import { readEdhrecDeck } from '../utils/edhrecDeck'

interface ImportResponse {
  name: string
  raw: string
  source: string
  cardCount: number
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/**
 * Extract a slug from an EDHREC URL.
 * Handles:
 *   https://edhrec.com/commanders/atraxa-praetors-voice
 *   https://edhrec.com/average-decks/atraxa-praetors-voice
 *   https://edhrec.com/decks/...  (user decks → handled separately)
 */
// Slugs/hashes are part of upstream URLs we build, so allow only safe chars
// (blocks path traversal / odd input like `..` or encoded separators).
const SLUG_RE = /^[a-z0-9-]+$/i

function parseEdhrecUrl(url: string): { type: 'average' | 'deckpreview', slug: string } | null {
  try {
    const u = new URL(url)
    if (u.hostname !== 'edhrec.com' && u.hostname !== 'www.edhrec.com' && u.hostname !== 'json.edhrec.com')
      return null

    const parts = u.pathname.split('/').filter(Boolean)
    const first = parts[0]
    const second = parts[1]
    if (!first)
      return null

    // /deckpreview/<hash>
    if (first === 'deckpreview' && second) {
      return SLUG_RE.test(second) ? { type: 'deckpreview', slug: second } : null
    }

    // /commanders/<slug>, /average-decks/<slug>, /decks/<slug>
    if (['commanders', 'average-decks', 'decks'].includes(first) && second) {
      return SLUG_RE.test(second) ? { type: 'average', slug: second } : null
    }

    // Bare slug fallback: /atraxa-praetors-voice
    if (parts.length === 1) {
      return SLUG_RE.test(first) ? { type: 'average', slug: first } : null
    }

    return null
  }
  catch {
    return null
  }
}

/** A refusal the dashboard translates: `data.code` names the case. */
export type ImportErrorCode = 'missingUrl' | 'unsupported' | 'notFound' | 'empty' | 'upstream'

class ImportFailure extends Error {
  constructor(readonly code: ImportErrorCode, detail: string) {
    super(detail)
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, signal: AbortSignal.timeout(15_000) })
  if (res.status === 404)
    throw new ImportFailure('notFound', `404 for ${url}`)
  if (!res.ok)
    throw new ImportFailure('upstream', `${res.status} for ${url}`)
  return res.json()
}

function headerName(data: unknown, fallback: string): string {
  const header = (data as { header?: unknown } | null)?.header
  if (typeof header !== 'string')
    return fallback
  // "Average Deck for Atraxa, Praetors' Voice" / "Deck with …" → the commander.
  return header.replace(/^(?:average deck for|deck with)\s+/i, '').replace(/\s*\(.*?\)\s*$/, '').trim() || fallback
}

async function importEdhrecAverage(slug: string): Promise<ImportResponse> {
  const data = await fetchJson(`https://json.edhrec.com/pages/average-decks/${slug}.json`)
  const deck = readEdhrecDeck(data)
  if (!deck)
    throw new ImportFailure('empty', `no cards for ${slug}`)
  const name = deck.commanders[0] ?? headerName(data, slug.replace(/-/g, ' '))
  return {
    name: `${name} (EDHREC)`,
    raw: deck.lines.join('\n'),
    source: `https://edhrec.com/average-decks/${slug}`,
    cardCount: deck.cardCount,
  }
}

async function importEdhrecDeckpreview(hash: string): Promise<ImportResponse> {
  // The json.edhrec.com mirror refuses deck previews; the site's own API serves them.
  const data = await fetchJson(`https://edhrec.com/api/deckpreview/${hash}`)
  const deck = readEdhrecDeck(data)
  if (!deck)
    throw new ImportFailure('empty', `no cards for ${hash}`)
  const name = deck.commanders[0] ?? headerName(data, 'EDHREC')
  return {
    name: `${name} (EDHREC)`,
    raw: deck.lines.join('\n'),
    source: `https://edhrec.com/deckpreview/${hash}`,
    cardCount: deck.cardCount,
  }
}

/**
 * Extract the numeric deck id from an Archidekt deck URL.
 * Handles:
 *   https://archidekt.com/decks/123456/my-deck-name
 *   https://archidekt.com/decks/123456
 */
function parseArchidektUrl(url: string): number | null {
  try {
    const u = new URL(url)
    if (u.hostname !== 'archidekt.com' && u.hostname !== 'www.archidekt.com')
      return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'decks' || !parts[1])
      return null
    const id = Number.parseInt(parts[1], 10)
    return Number.isFinite(id) && id > 0 ? id : null
  }
  catch {
    return null
  }
}

interface ArchidektCard {
  quantity?: number
  categories?: string[] | null
  card?: { oracleCard?: { name?: string } }
}
interface ArchidektDeck {
  name?: string
  cards?: ArchidektCard[]
}

async function importArchidekt(id: number): Promise<ImportResponse> {
  const data = await fetchJson(`https://archidekt.com/api/decks/${id}/`) as ArchidektDeck
  const entries = Array.isArray(data.cards) ? data.cards : []
  if (!entries.length)
    throw new ImportFailure('empty', `deck ${id} is empty`)

  const commanderLines: string[] = []
  const sideboardLines: string[] = []
  const mainLines: string[] = []
  let cardCount = 0

  for (const entry of entries) {
    const name = entry.card?.oracleCard?.name
    const quantity = entry.quantity ?? 1
    if (!name || quantity < 1)
      continue
    const categories = entry.categories ?? []
    // "Maybeboard" is Archidekt's own opt-out category (cards tracked but not
    // actually in the list) — the one category worth excluding entirely.
    if (categories.includes('Maybeboard'))
      continue
    const line = `${quantity} ${name}`
    cardCount += quantity
    if (categories.includes('Commander'))
      commanderLines.push(line)
    else if (categories.includes('Sideboard'))
      sideboardLines.push(line)
    else
      mainLines.push(line)
  }

  if (!commanderLines.length && !mainLines.length)
    throw new ImportFailure('empty', `deck ${id} has nothing to import`)

  // Commander first (detectCommanderIndex finds it by type, but this matches
  // the EDHREC importer's convention and reads naturally either way), then the
  // rest, then an explicit Sideboard section if there was one.
  const lines = [...commanderLines, ...mainLines]
  if (sideboardLines.length)
    lines.push('Sideboard', ...sideboardLines)

  return {
    name: data.name ? `${data.name} (Archidekt)` : 'Deck Archidekt',
    raw: lines.join('\n'),
    source: `https://archidekt.com/decks/${id}`,
    cardCount,
  }
}

function refuse(statusCode: number, code: ImportErrorCode): never {
  throw createError({ statusCode, statusMessage: 'Import failed', data: { code } })
}

export default defineEventHandler(async (event): Promise<ImportResponse> => {
  // An open door to two sites: bounded per address.
  rateLimit(`import:${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}`, 20, 60_000)

  // readBody throws on a malformed/non-JSON body — treat that as a missing URL.
  const body = await readBody<{ url?: unknown }>(event).catch(() => null)
  const url = typeof body?.url === 'string' ? body.url.trim().slice(0, 500) : ''
  if (!url)
    refuse(400, 'missingUrl')

  try {
    const edhrec = parseEdhrecUrl(url)
    if (edhrec)
      return edhrec.type === 'deckpreview' ? await importEdhrecDeckpreview(edhrec.slug) : await importEdhrecAverage(edhrec.slug)
    const archidektId = parseArchidektUrl(url)
    if (archidektId)
      return await importArchidekt(archidektId)
  }
  catch (err) {
    if (err instanceof ImportFailure) {
      console.warn('[import]', err.code, err.message)
      refuse(err.code === 'notFound' ? 404 : err.code === 'empty' ? 422 : 502, err.code)
    }
    console.warn('[import] upstream failure', err)
    refuse(502, 'upstream')
  }
  refuse(400, 'unsupported')
})
