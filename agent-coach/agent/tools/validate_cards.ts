import { defineTool } from 'eve/tools'
import { z } from 'zod'

// Confirm card names are real, in a commander's colour identity, and
// Commander-legal — the same gate the main app applies server-side. Call this
// before recommending specific named cards to guarantee the player can add them.

const UA = 'Spellforge-Coach/0.1 (deckbuilder PoC)'

export default defineTool({
  description:
    'Validate card names: confirm each exists, is within the commander colour identity, and is Commander-legal. Use before recommending specific cards so you never suggest something the player cannot add.',
  inputSchema: z.object({
    names: z.array(z.string()).min(1).max(75),
    identity: z.array(z.string()).default([]).describe('Commander colour identity letters, e.g. ["W","U","B"]. Empty = no constraint.'),
  }),
  async execute({ names, identity }) {
    const allowed = new Set(identity.map(c => c.toLowerCase()))
    const res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ identifiers: [...new Set(names)].map(name => ({ name })) }),
    })
    if (!res.ok)
      return { error: `Scryfall ${res.status}`, valid: [], invalid: names }
    const data = await res.json() as { data?: any[], not_found?: any[] }
    const resolved = new Map<string, any>()
    for (const c of data.data ?? []) {
      if (c.name)
        resolved.set(c.name.toLowerCase(), c)
    }
    const valid: { name: string, color_identity: string[], price_eur: string | null }[] = []
    const invalid: { name: string, why: string }[] = []
    for (const name of names) {
      const c = resolved.get(name.trim().toLowerCase())
      if (!c) {
        invalid.push({ name, why: 'not found' })
        continue
      }
      const id: string[] = c.color_identity ?? []
      if (allowed.size && id.some(x => !allowed.has(x.toLowerCase()))) {
        invalid.push({ name: c.name, why: `off-colour (${id.join('') || 'C'})` })
        continue
      }
      if (c.legalities?.commander === 'not_legal' || c.legalities?.commander === 'banned') {
        invalid.push({ name: c.name, why: 'not Commander-legal' })
        continue
      }
      valid.push({ name: c.name, color_identity: id, price_eur: c.prices?.eur ?? null })
    }
    return { valid, invalid }
  },
})
