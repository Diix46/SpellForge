/**
 * Riftbound's champions in League of Legends' own art: a Legend's champion
 * (its first tag, "Jinx", "Kai'Sa") to its Data Dragon id ("Kaisa"), from
 * Riot's champion list, read once a day.
 */
const squash = (s: string) => s.normalize('NFD').replace(/[^a-z]/gi, '').toLowerCase()

const championIds = defineCachedFunction(async (): Promise<Record<string, string>> => {
  const versions = await $fetch<string[]>('https://ddragon.leagueoflegends.com/api/versions.json')
  const list = await $fetch<{ data: Record<string, { id: string, name: string }> }>(`https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/en_US/champion.json`)
  const out: Record<string, string> = {}
  for (const c of Object.values(list.data)) {
    out[squash(c.name)] = c.id
    out[squash(c.id)] = c.id
  }
  return out
}, { maxAge: 60 * 60 * 24, name: 'lol-champions', getKey: () => 'all' })

/** A champion's splash art (skin 0, or the one asked), as the app serves it; null when unknown. */
export async function lolSplash(champion: string | null | undefined, skin = 0): Promise<string | null> {
  if (!champion)
    return null
  const ids = await championIds().catch(() => ({} as Record<string, string>))
  const id = ids[squash(champion)]
  return id ? `/api/images/lol/${id}_${skin}.jpg` : null
}

/** Arcane's first season, in the champions' Arcane skins: Jinx at its end first. */
export const ARCANE_MURALS = ['Jinx_37', 'Vi_29', 'Caitlyn_28', 'Jayce_24', 'Ekko_36', 'Heimerdinger_33'].map(s => `/api/images/lol/${s}.jpg`)
