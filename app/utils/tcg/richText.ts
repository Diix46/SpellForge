/**
 * A card's rules text, cut into what it shows: plain words, the game's
 * symbols (Riftbound's `:rb_energy_2:`, `:rb_rune_fury:`…) and its bracketed
 * keywords (`[Accélération]`). The sources carry a few HTML entities too
 * (`&gt;`), decoded here so they never reach the page as such.
 */
export type RichSegment
  = | { kind: 'text', value: string }
    | { kind: 'symbol', id: string }
    | { kind: 'keyword', value: string }

const ENTITIES: Record<string, string> = { '&gt;': '>', '&lt;': '<', '&amp;': '&', '&quot;': '"', '&#39;': '\'', '&apos;': '\'', '&nbsp;': ' ' }

export function decodeEntities(text: string): string {
  return text.replace(/&(?:gt|lt|amp|quot|apos|nbsp|#39);/g, m => ENTITIES[m] ?? m)
}

/** Keywords are cut out only where the game writes them in brackets. */
export function richText(text: string, { keywords = false } = {}): RichSegment[] {
  const out: RichSegment[] = []
  const source = decodeEntities(text)
  const pattern = keywords ? /:(rb_[a-z0-9_]+):|\[([^\]\n]{1,40})\]/g : /:(rb_[a-z0-9_]+):/g
  let last = 0
  for (const m of source.matchAll(pattern)) {
    if (m.index > last)
      out.push({ kind: 'text', value: source.slice(last, m.index) })
    out.push(m[1] ? { kind: 'symbol', id: m[1] } : { kind: 'keyword', value: m[2]! })
    last = m.index + m[0].length
  }
  if (last < source.length)
    out.push({ kind: 'text', value: source.slice(last) })
  return out
}

/** What a Riftbound symbol stands for: an energy cost, a rune, might, exhaust. */
export function riftSymbol(id: string): { kind: 'energy', n: number } | { kind: 'rune', rune: string } | { kind: 'might' } | { kind: 'exhaust' } | { kind: 'unknown' } {
  const energy = /^rb_energy_(\d+)$/.exec(id)
  if (energy)
    return { kind: 'energy', n: Number(energy[1]) }
  const rune = /^rb_rune_([a-z]+)$/.exec(id)
  if (rune)
    return { kind: 'rune', rune: rune[1]! }
  if (id === 'rb_might')
    return { kind: 'might' }
  if (id === 'rb_exhaust')
    return { kind: 'exhaust' }
  return { kind: 'unknown' }
}
