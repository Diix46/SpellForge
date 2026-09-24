import type { PrintOption } from '#shared/mtg/prints'

export type { PrintOption } from '#shared/mtg/prints'
export { printKey } from '#shared/mtg/prints'

// The printings of a card change only when the card database is re-ingested, so
// one answer per (language, name) serves the whole session: the detail view's
// picker, the preview grid's ‹ › browsing and the deck-wide actions share it.
// Promises are cached, not results, so two callers asking at once share a fetch.
const cache = new Map<string, Promise<PrintOption[]>>()
const CACHE_MAX = 2000

const keyOf = (name: string, lang: string) => `${lang}|${name.trim().toLowerCase()}`

function remember(key: string, value: Promise<PrintOption[]>) {
  if (cache.size >= CACHE_MAX)
    cache.delete(cache.keys().next().value!)
  cache.set(key, value)
  // A failed lookup is never kept: the next caller asks again.
  value.catch(() => cache.delete(key))
}

export function usePrintings() {
  /** Every printing of one card that can show in `lang`, newest first. */
  function printsOf(name: string, lang: 'en' | 'fr'): Promise<PrintOption[]> {
    const key = keyOf(name, lang)
    const hit = cache.get(key)
    if (hit)
      return hit
    const fresh = $fetch<{ prints: PrintOption[] }>('/api/cards/prints', { params: { name, lang } })
      .then(r => r.prints)
    remember(key, fresh)
    return fresh
  }

  /** The printings of many cards in one request (cached ones are not asked again). */
  async function printsOfMany(names: string[], lang: 'en' | 'fr'): Promise<Map<string, PrintOption[]>> {
    const unique = [...new Set(names.map(n => n.trim()).filter(Boolean))]
    const missing = unique.filter(n => !cache.has(keyOf(n, lang)))
    if (missing.length) {
      const batch = $fetch<{ prints: Record<string, PrintOption[]> }>('/api/cards/prints', {
        method: 'POST',
        body: { names: missing, lang },
      })
      for (const name of missing)
        remember(keyOf(name, lang), batch.then(r => r.prints[name] ?? []))
    }
    const out = new Map<string, PrintOption[]>()
    await Promise.all(unique.map(async (n) => {
      out.set(n, await printsOf(n, lang))
    }))
    return out
  }

  return { printsOf, printsOfMany }
}
