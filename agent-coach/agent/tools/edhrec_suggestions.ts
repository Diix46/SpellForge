import { defineTool } from 'eve/tools'
import { z } from 'zod'

// Community ground truth: what cards are actually played with a given commander
// (EDHREC high-synergy + top cards). Prefer this over recalling "good cards" —
// it's real aggregated human data, ordered by relevance.

const UA = 'Spellforge-Coach/0.1 (deckbuilder PoC)'

// EDHREC slug: lowercase, strip accents, drop apostrophes, non-alnum → hyphens.
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface Cardview { name?: string }
interface Cardlist { header?: string, cardviews?: Cardview[] }

export default defineTool({
  description:
    'Get the cards most commonly played with a given commander (EDHREC community data). Use this for "what should I add" / commander-fit questions — these are real, popular, relevant card names.',
  inputSchema: z.object({
    commander: z.string().min(1).describe('The commander\'s exact English name.'),
    limit: z.number().int().min(1).max(60).default(30),
  }),
  async execute({ commander, limit }) {
    const url = `https://json.edhrec.com/pages/commanders/${slugify(commander)}.json`
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
    if (!res.ok)
      return { commander, names: [], note: `EDHREC ${res.status} — unknown commander slug or transient error.` }
    const data = await res.json() as { container?: { json_dict?: { cardlists?: Cardlist[] } } }
    const lists = data.container?.json_dict?.cardlists ?? []
    const ordered = [
      ...lists.filter(l => l.header === 'High Synergy Cards'),
      ...lists.filter(l => l.header === 'Top Cards'),
      ...lists.filter(l => l.header !== 'High Synergy Cards' && l.header !== 'Top Cards'),
    ]
    const seen = new Set<string>()
    const names: string[] = []
    for (const list of ordered) {
      for (const cv of list.cardviews ?? []) {
        const n = cv.name?.trim()
        if (n && !seen.has(n.toLowerCase())) {
          seen.add(n.toLowerCase())
          names.push(n)
        }
        if (names.length >= limit)
          break
      }
      if (names.length >= limit)
        break
    }
    return { commander, names }
  },
})
