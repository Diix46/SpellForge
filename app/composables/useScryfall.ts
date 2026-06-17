import type { DeckEntry } from './useDecklist'

export interface ScryfallCard {
  id: string
  oracle_id?: string
  name: string
  printed_name?: string
  lang: string
  set: string
  set_name: string
  collector_number: string
  rarity?: string
  scryfall_uri?: string
  type_line?: string
  printed_type_line?: string
  mana_cost?: string
  cmc?: number
  oracle_text?: string
  printed_text?: string
  colors?: string[]
  color_identity?: string[]
  keywords?: string[]
  prices?: {
    eur?: string | null
    eur_foil?: string | null
    usd?: string | null
  }
  image_uris?: {
    small: string
    normal: string
    large: string
    png: string
  }
  card_faces?: Array<{
    name: string
    printed_name?: string
    type_line?: string
    printed_type_line?: string
    mana_cost?: string
    oracle_text?: string
    printed_text?: string
    image_uris?: {
      small: string
      normal: string
      large: string
      png: string
    }
  }>
  layout: string
  // Scryfall image quality: 'missing' | 'placeholder' | 'lowres' | 'highres_scan'
  image_status?: string
}

export interface ResolvedCard {
  entry: DeckEntry
  card: ScryfallCard | null
  imageUrl: string | null
  backImageUrl: string | null
  lang: string
  // Best EUR price (FR printing first, else the default/EN printing — FR prints
  // are often priceless on Cardmarket, so we keep the default as a fallback).
  priceEur?: string | null
  error?: string
}

export interface FetchProgress {
  loaded: number
  total: number
}

const SCRYFALL_BASE = 'https://api.scryfall.com'
const BATCH_SIZE = 75
const DELAY_MS = 100

const DFC_LAYOUTS = ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card', 'art_series']

function isDoubleFaced(card: ScryfallCard): boolean {
  return DFC_LAYOUTS.includes(card.layout) && !!card.card_faces?.[1]?.image_uris
}

function frontImage(card: ScryfallCard, quality: 'normal' | 'large' | 'png' = 'large'): string | null {
  if (card.image_uris)
    return card.image_uris[quality] ?? card.image_uris.normal
  if (card.card_faces?.[0]?.image_uris) {
    return card.card_faces[0].image_uris[quality] ?? card.card_faces[0].image_uris.normal
  }
  return null
}

function backImage(card: ScryfallCard, quality: 'normal' | 'large' | 'png' = 'large'): string | null {
  if (card.card_faces?.[1]?.image_uris) {
    return card.card_faces[1].image_uris[quality] ?? card.card_faces[1].image_uris.normal
  }
  return null
}

// Simple per-session cache keyed by `${set}/${number}/${lang}` and by name.
const cardCache = new Map<string, ScryfallCard | null>()
const frByNameCache = new Map<string, ScryfallCard | null>()

function hasImage(card: ScryfallCard | null): boolean {
  return !!card && (!!card.image_uris || !!card.card_faces?.[0]?.image_uris)
}

// A "real" image excludes Scryfall's "Localized Image Not Available" placeholders.
function hasRealImage(card: ScryfallCard | null): boolean {
  if (!hasImage(card))
    return false
  const status = card!.image_status
  return status !== 'placeholder' && status !== 'missing'
}

export function useScryfall() {
  // Try the exact printing in the requested language.
  async function fetchLocalized(
    set: string,
    collectorNumber: string,
    lang: string,
  ): Promise<ScryfallCard | null> {
    const key = `${set}/${collectorNumber}/${lang}`
    if (cardCache.has(key))
      return cardCache.get(key)!
    try {
      const res = await fetch(`${SCRYFALL_BASE}/cards/${set.toLowerCase()}/${collectorNumber}/${lang}`)
      const card = res.ok ? await res.json() : null
      cardCache.set(key, card)
      return card
    }
    catch {
      cardCache.set(key, null)
      return null
    }
  }

  // Fallback: search for ANY French printing of a card by exact name.
  // Many printings (promos, Mystery Booster, etc.) have no FR version, but
  // another printing of the same card usually does.
  async function searchFrenchByName(name: string): Promise<ScryfallCard | null> {
    const cacheName = name.toLowerCase()
    if (frByNameCache.has(cacheName))
      return frByNameCache.get(cacheName)!
    try {
      const q = `!"${name}" lang:fr`
      const url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(q)}&order=released&dir=desc&unique=prints`
      const res = await fetch(url)
      if (!res.ok) {
        frByNameCache.set(cacheName, null)
        return null
      }
      const data = await res.json()
      const target = name.toLowerCase()

      // Only printings that have an actual image (no "not available" placeholders),
      // and whose full name matches exactly (avoids split/adventure cards like
      // "Emeritus of Conflict // Lightning Bolt" matching "Lightning Bolt").
      const realImages: ScryfallCard[] = (data.data ?? [])
        .filter((c: ScryfallCard) => hasRealImage(c) && c.name.toLowerCase() === target)

      // Prefer the highest-quality scan available.
      const highres = realImages.find(c => c.image_status === 'highres_scan')
      const card: ScryfallCard | null = highres ?? realImages[0] ?? null
      frByNameCache.set(cacheName, card)
      return card
    }
    catch {
      frByNameCache.set(cacheName, null)
      return null
    }
  }

  // Resolve the best French version of a matched card with a REAL image,
  // or null if no usable French printing exists (caller keeps the English card).
  async function resolveFrench(match: ScryfallCard): Promise<ScryfallCard | null> {
    if (match.lang === 'fr' && hasRealImage(match))
      return match
    // 1. exact printing in FR (only if it has a real image)
    const exact = await fetchLocalized(match.set, match.collector_number, 'fr')
    if (hasRealImage(exact))
      return exact
    // 2. any FR printing by name with a real image
    const byName = await searchFrenchByName(match.name)
    if (hasRealImage(byName))
      return byName
    return null
  }

  async function fetchCollection(
    entries: DeckEntry[],
    lang: 'en' | 'fr',
    onProgress?: (p: FetchProgress) => void,
  ): Promise<ResolvedCard[]> {
    const results: ResolvedCard[] = []
    let processed = 0

    // Process in batches of BATCH_SIZE using the /cards/collection endpoint.
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE)

      const identifiers = batch.map((entry) => {
        if (entry.set && entry.collectorNumber) {
          return { set: entry.set.toLowerCase(), collector_number: entry.collectorNumber }
        }
        return { name: entry.name }
      })

      let foundCards: ScryfallCard[] = []
      let requestError: string | null = null

      try {
        const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers }),
        })
        if (!res.ok)
          throw new Error(`Scryfall ${res.status}`)
        const data = await res.json()
        foundCards = data.data ?? []
      }
      catch (err) {
        requestError = err instanceof Error ? err.message : 'erreur réseau'
      }

      // Scryfall returns found cards in the SAME ORDER as the identifiers,
      // but omits not-found ones, so we match by name/set to be safe.
      for (const entry of batch) {
        if (requestError) {
          results.push({
            entry,
            card: null,
            imageUrl: null,
            backImageUrl: null,
            lang,
            error: `Erreur réseau: ${requestError}`,
          })
          processed++
          onProgress?.({ loaded: processed, total: entries.length })
          continue
        }

        const match = findMatch(foundCards, entry)
        if (!match) {
          results.push({
            entry,
            card: null,
            imageUrl: null,
            backImageUrl: null,
            lang,
            error: `Carte introuvable: ${entry.name}`,
          })
          processed++
          onProgress?.({ loaded: processed, total: entries.length })
          continue
        }

        let finalCard = match
        let finalLang = match.lang

        // Try to get a French version of the card (exact printing, then any FR printing).
        if (lang === 'fr') {
          const fr = await resolveFrench(match)
          if (fr) {
            finalCard = fr
            finalLang = 'fr'
          }
        }

        // Price: prefer the displayed card's EUR, else the default printing's EUR.
        const priceEur = finalCard.prices?.eur ?? match.prices?.eur ?? null

        results.push({
          entry,
          card: finalCard,
          imageUrl: frontImage(finalCard),
          backImageUrl: isDoubleFaced(finalCard) ? backImage(finalCard) : null,
          lang: finalLang,
          priceEur,
        })
        processed++
        onProgress?.({ loaded: processed, total: entries.length })
      }

      if (i + BATCH_SIZE < entries.length) {
        await new Promise(r => setTimeout(r, DELAY_MS))
      }
    }

    return results
  }

  function findMatch(cards: ScryfallCard[], entry: DeckEntry): ScryfallCard | null {
    // Prefer exact set + collector number match.
    if (entry.set && entry.collectorNumber) {
      const exact = cards.find(
        c => c.set?.toLowerCase() === entry.set!.toLowerCase()
          && c.collector_number === entry.collectorNumber,
      )
      if (exact)
        return exact
    }
    // Otherwise match by name (case-insensitive, handle split/DFC "A // B").
    const target = entry.name.toLowerCase()
    return cards.find((c) => {
      const n = c.name.toLowerCase()
      return n === target || n.split(' // ')[0] === target
    }) ?? null
  }

  return { fetchCollection, isDoubleFaced }
}
