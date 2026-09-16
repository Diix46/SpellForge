import type { LandingCard } from '~~/server/api/landing/cards.get'
import { watch } from 'vue'
import { useState } from '#app'

// Shared pool of marketing-landing card art (the portal's Magic pages +
// Page's step mockups both derive from this). A single fetch, cached as a
// useState singleton, instead of each component independently hitting
// /api/landing/cards on mount — and re-fetched whenever the site locale
// changes, so a FR/EN toggle actually swaps the card art/names shown
// instead of leaving them pinned to whichever language loaded first.
//
// Module-scoped (not a ref): a genuinely in-flight fetch, shared across every
// component calling this composable so a second caller awaits the SAME
// request instead of independently no-op'ing before the first one lands.
let inFlight: Promise<void> | null = null

export function useLandingCards() {
  const { locale } = useLocale()
  const pool = useState<LandingCard[]>('landing-cards-pool', () => [])
  const poolLocale = useState('landing-cards-pool-locale', () => '')

  function fetchPool(): Promise<void> {
    if (!import.meta.client || poolLocale.value === locale.value)
      return Promise.resolve()
    if (inFlight)
      return inFlight
    inFlight = (async () => {
      try {
        const { cards } = await $fetch<{ cards: LandingCard[] }>('/api/landing/cards', {
          query: { lang: locale.value, _: Date.now() },
        })
        pool.value = (cards ?? []).filter(c => c.image && c.art)
        poolLocale.value = locale.value
      }
      catch {
        // graceful: consumers fall back to placeholder tiles when the pool is empty
        pool.value = []
      }
      finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  if (import.meta.client) {
    fetchPool()
    watch(locale, fetchPool)
  }

  return { pool, fetchPool }
}
