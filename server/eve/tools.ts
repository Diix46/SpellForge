import type Anthropic from '@anthropic-ai/sdk'
// Eve coach tools — the real-data capabilities every agent can call. Each tool is
// an Anthropic tool definition + a server-side executor that reuses the existing
// Nitro utils (Scryfall search, EDHREC suggestions, the identity/legality gate),
// so the agents reason over ground truth instead of hallucinating card data.
//
// Tool NAMES match what the front already labels (useCoach.ts TOOL_LABEL):
// scryfall_search, edhrec_suggestions, validate_cards.

import { edhrecSuggestions } from '../utils/edhrec'
import { resolveScryfallByName, SCRYFALL_SEARCH, scryfallFetch } from '../utils/scryfall'
import { inIdentity, legalInCommander } from '../utils/suggestValidate'

export type ToolName = 'scryfall_search' | 'edhrec_suggestions' | 'validate_cards'

// ── Tool definitions (sent to the model) ────────────────────────────────────
export const EVE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'scryfall_search',
    description: 'Search Magic: The Gathering cards via Scryfall query syntax (e.g. "id<=wubrg t:instant cmc<=2"). Returns up to 20 matching real cards with name, mana cost, type, oracle text, colour identity and price. Use this to find REAL cards instead of recalling them.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'A Scryfall search query.' },
      },
    },
  },
  {
    name: 'edhrec_suggestions',
    description: 'Get the cards most commonly played with a given Commander (EDHREC community data, English names, high-synergy first). Use to ground ADD suggestions in what the community actually runs.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['commander'],
      properties: {
        commander: { type: 'string', description: 'The exact commander name.' },
      },
    },
  },
  {
    name: 'validate_cards',
    description: 'Validate proposed card names against Scryfall: confirms each is a real card, whether it is within the given colour identity, and whether it is legal in Commander. ALWAYS validate ADD suggestions before presenting them.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['names'],
      properties: {
        names: { type: 'array', items: { type: 'string' }, description: 'Card names to validate.' },
        identity: { type: 'array', items: { type: 'string' }, description: 'Allowed WUBRG identity letters (e.g. ["w","u","b"]). Empty = no constraint.' },
      },
    },
  },
]

// ── Executors ───────────────────────────────────────────────────────────────
interface ScrySearchCard {
  name?: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  color_identity?: string[]
  prices?: { eur?: string | null, usd?: string | null }
}

async function runScryfallSearch(query: string): Promise<unknown> {
  const url = `${SCRYFALL_SEARCH}?q=${encodeURIComponent(query)}&order=edhrec&dir=auto`
  const res = await scryfallFetch(url)
  if (res.status === 404)
    return { count: 0, cards: [] }
  if (!res.ok)
    return { error: `Scryfall ${res.status}`, cards: [] }
  const data = await res.json() as { total_cards?: number, data?: ScrySearchCard[] }
  const cards = (data.data ?? []).slice(0, 20).map(c => ({
    name: c.name,
    manaCost: c.mana_cost ?? '',
    type: c.type_line ?? '',
    text: (c.oracle_text ?? '').slice(0, 240),
    identity: (c.color_identity ?? []).map(x => x.toLowerCase()),
    priceEur: c.prices?.eur ?? null,
  }))
  return { count: data.total_cards ?? cards.length, cards }
}

async function runEdhrec(commander: string): Promise<unknown> {
  const names = await edhrecSuggestions(commander)
  return { commander, names: names.slice(0, 40) }
}

interface ValCard { name?: string, color_identity?: string[], legalities?: Record<string, string> }
async function runValidate(names: string[], identity: string[]): Promise<unknown> {
  const clean = (Array.isArray(names) ? names : []).map(n => String(n).trim()).filter(Boolean).slice(0, 60)
  if (!clean.length)
    return { results: [] }
  const allowed = new Set((Array.isArray(identity) ? identity : []).map(c => String(c).toLowerCase()))
  const resolved = await resolveScryfallByName<ValCard>(clean)
  const results = clean.map((n) => {
    const card = resolved.get(n.toLowerCase())
    if (!card)
      return { name: n, real: false, inIdentity: false, legal: false }
    return {
      name: card.name ?? n,
      real: true,
      inIdentity: allowed.size === 0 || inIdentity(card, allowed),
      legal: legalInCommander(card),
    }
  })
  return { results }
}

// Dispatch a tool call by name; never throws — returns an error payload the model
// can read and recover from, so one bad tool call can't kill the turn.
export async function runTool(name: string, input: unknown): Promise<unknown> {
  try {
    const args = (input ?? {}) as Record<string, unknown>
    switch (name) {
      case 'scryfall_search':
        return await runScryfallSearch(String(args.query ?? ''))
      case 'edhrec_suggestions':
        return await runEdhrec(String(args.commander ?? ''))
      case 'validate_cards':
        return await runValidate(args.names as string[], args.identity as string[])
      default:
        return { error: `unknown tool: ${name}` }
    }
  }
  catch (err) {
    return { error: err instanceof Error ? err.message : 'tool failed' }
  }
}
