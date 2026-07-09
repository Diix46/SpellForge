// Server route to import decklists from external sites (bypasses browser CORS).
// Supports EDHREC (commander average decks + deckpreview pages) and Archidekt
// (public deck pages, via Archidekt's public read API).

interface ImportRequest {
  url: string
}

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

// Minimal shape of the EDHREC JSON endpoints we read.
interface EdhrecJson {
  deck?: unknown
  header?: unknown
  cards?: unknown
  commanders?: unknown
}

async function fetchJson(url: string): Promise<EdhrecJson> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
  if (!res.ok) {
    throw new Error(`Upstream ${res.status} for ${url}`)
  }
  return res.json() as Promise<EdhrecJson>
}

async function importEdhrecAverage(slug: string): Promise<ImportResponse> {
  // Try the dedicated average-decks endpoint first (clean "1 Card Name" list).
  const data = await fetchJson(`https://json.edhrec.com/pages/average-decks/${slug}.json`)

  const deckArr: string[] = Array.isArray(data?.deck) ? data.deck : []
  if (!deckArr.length) {
    throw new Error('Aucune liste de cartes trouvée pour ce commandant.')
  }

  const name: string = data?.header
    ? String(data.header).replace(/\s*\(.*?\)\s*$/, '').trim()
    : slug.replace(/-/g, ' ')

  const raw = deckArr.join('\n')
  const cardCount = deckArr.reduce((sum, line) => {
    const m = line.match(/^(\d+)\s+/)
    return sum + (m?.[1] ? Number.parseInt(m[1]) : 1)
  }, 0)

  return {
    name: `${name} (EDHREC)`,
    raw,
    source: `https://edhrec.com/average-decks/${slug}`,
    cardCount,
  }
}

async function importEdhrecDeckpreview(hash: string): Promise<ImportResponse> {
  // Deckpreview pages expose their list at json.edhrec.com/pages/deckpreview/<hash>.json
  const data = await fetchJson(`https://json.edhrec.com/pages/deckpreview/${hash}.json`)

  const cards: string[] = Array.isArray(data?.cards) ? data.cards : []
  const commander: string | undefined = Array.isArray(data?.commanders) ? data.commanders[0] : undefined

  if (!cards.length) {
    throw new Error('Deck introuvable sur EDHREC.')
  }

  const lines: string[] = []
  if (commander)
    lines.push(`1 ${commander}`)
  for (const c of cards) lines.push(`1 ${c}`)

  return {
    name: commander ? `${commander} (EDHREC)` : 'Deck EDHREC',
    raw: lines.join('\n'),
    source: `https://edhrec.com/deckpreview/${hash}`,
    cardCount: lines.length,
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
  const res = await fetch(`https://archidekt.com/api/decks/${id}/`, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  })
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Deck introuvable ou privé.' : `Archidekt ${res.status}`)
  }
  const data = await res.json() as ArchidektDeck
  const entries = Array.isArray(data.cards) ? data.cards : []
  if (!entries.length) {
    throw new Error('Deck vide ou introuvable.')
  }

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

  if (!commanderLines.length && !mainLines.length) {
    throw new Error('Aucune carte importable trouvée dans ce deck.')
  }

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

export default defineEventHandler(async (event): Promise<ImportResponse> => {
  // readBody throws on a malformed/non-JSON body — treat that as a missing URL.
  const body = await readBody<ImportRequest>(event).catch(() => null)
  const url = body?.url?.trim()

  if (!url) {
    throw createError({ statusCode: 400, statusMessage: 'URL manquante' })
  }

  const edhrec = parseEdhrecUrl(url)
  if (edhrec) {
    try {
      if (edhrec.type === 'deckpreview') {
        return await importEdhrecDeckpreview(edhrec.slug)
      }
      return await importEdhrecAverage(edhrec.slug)
    }
    catch (err) {
      throw createError({
        statusCode: 502,
        statusMessage: `Import EDHREC échoué: ${err instanceof Error ? err.message : 'erreur inconnue'}`,
      })
    }
  }

  const archidektId = parseArchidektUrl(url)
  if (archidektId) {
    try {
      return await importArchidekt(archidektId)
    }
    catch (err) {
      throw createError({
        statusCode: 502,
        statusMessage: `Import Archidekt échoué: ${err instanceof Error ? err.message : 'erreur inconnue'}`,
      })
    }
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Site non supporté. URLs EDHREC ou Archidekt supportées.',
  })
})
