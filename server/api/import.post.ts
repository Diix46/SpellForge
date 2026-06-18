// Server route to import decklists from external sites (bypasses browser CORS).
// Currently supports EDHREC (commander average decks + deckpreview pages).

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
function parseEdhrecUrl(url: string): { type: 'average' | 'deckpreview', slug: string } | null {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('edhrec.com'))
      return null

    const parts = u.pathname.split('/').filter(Boolean)
    const first = parts[0]
    const second = parts[1]
    if (!first)
      return null

    // /deckpreview/<hash>
    if (first === 'deckpreview' && second) {
      return { type: 'deckpreview', slug: second }
    }

    // /commanders/<slug>, /average-decks/<slug>, /decks/<slug>
    if (['commanders', 'average-decks', 'decks'].includes(first) && second) {
      return { type: 'average', slug: second }
    }

    // Bare slug fallback: /atraxa-praetors-voice
    if (parts.length === 1) {
      return { type: 'average', slug: first }
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

  throw createError({
    statusCode: 400,
    statusMessage: 'Site non supporté. URLs EDHREC supportées (commanders/average-decks/deckpreview).',
  })
})
