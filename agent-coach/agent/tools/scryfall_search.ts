import { defineTool } from 'eve/tools'
import { z } from 'zod'

// Translate an intent into a Scryfall query and return REAL cards. The model
// writes the query; Scryfall returns only cards that exist. This is the
// anti-hallucination path for "find cards that do X".
//
// Pass a raw Scryfall query (e.g. `id<=bg o:"return target creature card from
// your graveyard" eur<=3`). Constrain to the commander identity with `id<=wubrg`
// and to the format with `legal:commander` when relevant.

const UA = 'Spellforge-Coach/0.1 (deckbuilder PoC)'

export default defineTool({
  description:
    'Search real Magic cards via Scryfall query syntax. Use this to find cards matching an intent or filters. Returns only cards that actually exist. Build the query yourself (e.g. id<=br t:goblin cmc<=3 legal:commander eur<=2).',
  inputSchema: z.object({
    query: z.string().min(1).describe('A Scryfall search query string.'),
    limit: z.number().int().min(1).max(20).default(12).describe('Max cards to return.'),
  }),
  async execute({ query, limit }) {
    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec&unique=cards`
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
    if (res.status === 404)
      return { query, total: 0, cards: [], note: 'No cards matched this query.' }
    if (!res.ok)
      return { query, error: `Scryfall ${res.status}`, cards: [] }
    const data = await res.json() as { total_cards?: number, data?: any[] }
    const cards = (data.data ?? []).slice(0, limit).map(c => ({
      name: c.name,
      mana_cost: c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? '',
      cmc: c.cmc,
      type_line: c.type_line,
      color_identity: c.color_identity ?? [],
      oracle_text: c.oracle_text ?? c.card_faces?.map((f: any) => f.oracle_text).filter(Boolean).join(' // ') ?? '',
      price_eur: c.prices?.eur ?? null,
      legal_commander: c.legalities?.commander === 'legal',
    }))
    return { query, total: data.total_cards ?? cards.length, cards }
  },
})
