import type { LandingCard } from '~~/server/api/landing/cards.get'
import type { OptcgCard } from '#shared/optcg/types'
import { computed } from 'vue'

/**
 * The landing's card art: rare Magic cards and One Piece Leaders and high
 * rarities, in the site language. Fetched with the page (the server renders
 * them) and shared by every section through the async-data key; a language
 * switch fetches the other pool.
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
    () => $fetch<{ cards: OptcgCard[] }>('/api/landing/optcg', { query: { lang: locale.value } })
      .then(r => r.cards)
      .catch(() => [] as OptcgCard[]),
    { watch: [locale], default: () => [] as OptcgCard[] },
  )

  return {
    mtg: computed(() => mtg.value ?? []),
    optcg: computed(() => optcg.value ?? []),
  }
}
