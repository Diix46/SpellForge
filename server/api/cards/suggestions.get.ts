// "Cards often played with this commander" via EDHREC's recommendation JSON.
// Returns a flat, de-duplicated list of suggested card names (English), ordered
// by relevance (high-synergy first, then top cards).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

interface Cardview { name?: string }
interface Cardlist { header?: string, cardviews?: Cardview[] }
interface EdhrecCommander {
  container?: { json_dict?: { cardlists?: Cardlist[] } }
}

// EDHREC slug: lowercase, strip accents, DROP apostrophes entirely (EDHREC does
// "Y'shtola, Night's Blessed" → "yshtola-nights-blessed", not "y-shtola-night-s"),
// then turn any remaining non-alphanumerics into single hyphens.
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // strip combining diacritics
    .toLowerCase()
    .replace(/['’]/g, '') // apostrophes vanish, not become separators
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Fetch + parse EDHREC for a commander slug. THROWS on an empty result so the
// cache layer never persists it — an empty list almost always means a transient
// failure (CDN edge / wrong slug), and persisting it would hide a later success
// for the whole cache window. Successful (non-empty) results ARE cached 24h.
const fetchSuggestions = defineCachedFunction(async (slug: string): Promise<string[]> => {
  const url = `https://json.edhrec.com/pages/commanders/${slug}.json`
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
  if (!res.ok)
    throw new Error(`edhrec ${res.status}`)
  const data = await res.json() as EdhrecCommander

  const lists = data.container?.json_dict?.cardlists ?? []
  // Prefer high-synergy + top cards; fall back to the rest.
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
      if (names.length >= 60)
        break
    }
    if (names.length >= 60)
      break
  }

  if (!names.length)
    throw new Error('edhrec empty') // don't cache empties
  return names
}, {
  maxAge: 86400,
  name: 'edhrec-suggestions',
  getKey: (slug: string) => slug,
})

export default defineEventHandler(async (event): Promise<{ names: string[] }> => {
  const query = getQuery(event)
  const commander = typeof query.commander === 'string' ? query.commander.trim() : ''
  if (!commander)
    return { names: [] }
  try {
    return { names: await fetchSuggestions(slugify(commander)) }
  }
  catch {
    // Unknown commander or transient EDHREC failure → empty, NOT cached.
    return { names: [] }
  }
})
