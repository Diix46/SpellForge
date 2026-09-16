import type { LandingCard, LandingPoster } from '#shared/landing'
import { computed } from 'vue'

/**
 * The landing's card art: rare Magic cards and One Piece Leaders and high
 * rarities, in the site language, enough of each for the hero's card tide.
 * Fetched with the page (the server renders them) and shared by every section
 * through the async-data key; a language switch fetches the other pool.
 */
export function useLandingCards() {
  const { locale } = useLocale()

  const { data: mtg } = useAsyncData(
    () => `landing-mtg-${locale.value}`,
    () => $fetch<{ cards: LandingCard[] }>('/api/landing/cards', { query: { lang: locale.value } })
      .then(r => r.cards.filter(c => c.image && c.art))
      .catch(() => [] as LandingCard[]),
    { watch: [locale], default: () => [] as LandingCard[] },
  )
  const { data: optcg } = useAsyncData(
    () => `landing-optcg-${locale.value}`,
    () => $fetch<{ cards: LandingPoster[] }>('/api/landing/optcg', { query: { lang: locale.value } })
      .then(r => r.cards)
      .catch(() => [] as LandingPoster[]),
    { watch: [locale], default: () => [] as LandingPoster[] },
  )

  return {
    mtg: computed(() => mtg.value ?? []),
    optcg: computed(() => optcg.value ?? []),
  }
}
