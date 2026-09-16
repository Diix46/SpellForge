import type Anthropic from '@anthropic-ai/sdk'
// Eve coach tools — the real-data capabilities every agent can call. Each tool is
// an Anthropic tool definition + a server-side executor that reuses the existing
// Nitro utils (local card search, EDHREC suggestions, the identity/legality gate),
// so the agents reason over ground truth instead of hallucinating card data.
//
// Tool NAMES match what the front already labels (useCoach.ts TOOL_LABEL):
// scryfall_search, edhrec_suggestions, validate_cards.

import { useMtgCardsDb } from '../utils/cards/db'
import { buildCoachSearchQuery } from '../utils/cards/mtg-query'
import { resolveCardsByName } from '../utils/cards/mtg-resolve'
import { colorsFromMask } from '../utils/cards/mtg-shape'
import { QuerySyntaxError } from '../utils/cards/mtg-syntax'
import { edhrecSuggestions } from '../utils/edhrec'
import { inIdentity, legalInCommander } from '../utils/suggestValidate'

export type ToolName = 'scryfall_search' | 'edhrec_suggestions' | 'validate_cards'

// ── Tool definitions (sent to the model) ────────────────────────────────────
export const EVE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'scryfall_search',
    // The name stays: the front labels tool calls by it, and the syntax is still Scryfall's.
    description: 'Search Commander-legal Magic: The Gathering cards with Scryfall query syntax (e.g. "id<=wubg t:instant cmc<=2 o:\"draw a card\""), most played first. Supported: bare words (name), t:, o:, fo:, kw:, c:, id:, produces:, m:, cmc:/mv:, pow:, tou:, loy:, eur:, r:, s:, a:, year:, f:/legal:/banned:, is:/not: (commander, gamechanger, reserved, dfc, permanent, historic, vanilla…), order:, "or", parentheses and "-" for negation. No usd:/tix: (prices are EUR) and no regex. Returns up to 20 real cards with name, mana cost, type, oracle text, colour identity and EUR price. Use this to find REAL cards instead of recalling them.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'A search query in Scryfall syntax.' },
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
    description: 'Validate proposed card names against the card database: confirms each is a real card, whether it is within the given colour identity, and whether it is legal in Commander. ALWAYS validate ADD suggestions before presenting them.',
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
// Local and fast, so no cache: the network calls this once saved are gone.
async function runCardSearch(query: string): Promise<unknown> {
  let q: ReturnType<typeof buildCoachSearchQuery>
  try {
    q = buildCoachSearchQuery(query)
  }
  catch (err) {
    // Tell the model what to fix; it usually retries with plain syntax.
    if (err instanceof QuerySyntaxError)
      return { error: `Invalid search syntax (${err.code}): ${err.term}`, cards: [] }
    throw err
  }
  const db = useMtgCardsDb()
  const [result, count] = await Promise.all([
    db.execute({ sql: q.sql, args: q.args }),
    db.execute({ sql: q.countSql, args: q.countArgs }),
  ])
  const cards = result.rows.map(r => ({
    name: String(r.name),
    manaCost: String(r.mana_cost ?? ''),
    type: String(r.type_line ?? ''),
    text: String(r.oracle_all ?? '').slice(0, 240),
    identity: colorsFromMask(r.identity_mask).map(c => c.toLowerCase()),
    priceEur: typeof r.min_price_eur === 'number' ? r.min_price_eur.toFixed(2) : null,
  }))
  return { count: Number(count.rows[0]?.total ?? cards.length), cards }
}

async function runEdhrec(commander: string): Promise<unknown> {
  const names = await edhrecSuggestions(commander)
  return { commander, names: names.slice(0, 40) }
}

interface ValCard { name?: string, color_identity?: string[], legalities?: Record<string, string> }
const runValidate = defineCachedFunction(async (names: string[], identity: string[]): Promise<unknown> => {
  const clean = (Array.isArray(names) ? names : []).map(n => String(n).trim()).filter(Boolean).slice(0, 60)
  if (!clean.length)
    return { results: [] }
  const allowed = new Set((Array.isArray(identity) ? identity : []).map(c => String(c).toLowerCase()))
  const resolved = await resolveCardsByName<ValCard>(useMtgCardsDb(), clean)
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
}, {
  maxAge: 300,
  name: 'eve-validate-cards',
  getKey: (names: string[], identity: string[]) =>
    `${(names ?? []).map(n => n.toLowerCase().trim()).sort().join(',')}|${(identity ?? []).map(c => c.toLowerCase()).sort().join(',')}`,
})

// Dispatch a tool call by name; never throws — returns an error payload the model
// can read and recover from, so one bad tool call can't kill the turn.
export async function runTool(name: string, input: unknown): Promise<unknown> {
  try {
    const args = (input ?? {}) as Record<string, unknown>
    switch (name) {
      case 'scryfall_search':
        return await runCardSearch(String(args.query ?? ''))
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
