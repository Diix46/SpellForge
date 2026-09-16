import type { Ref } from 'vue'
import type { OptcgCard } from '#shared/optcg/types'
import type { Deck } from './useDeckStore'
import { computed, shallowRef, watch } from 'vue'
import { totalCards } from '#shared/decklist'
import { parseMtgDecklist } from '#shared/mtg/decklist'
import { parseOptcgDecklist } from '#shared/optcg/decklist'
import { DECK_SIZE } from '#shared/optcg/rules'
import { OPTCG_COLOR_HEX, optcgAccentStyle } from '~/utils/optcgColors'

/** What a deck tile shows without resolving the whole deck. */
export interface DeckFingerprint {
  /** Cards in the deck proper (the One Piece Leader is counted apart). */
  count: number
  /** The size a finished deck has in its game. */
  target: number
  complete: boolean
  /** CSS colours of the deck's identity. */
  dots: string[]
  /** Colour letters (Magic) or the Leader's name (One Piece). */
  label: string
  /** Inline accent variables for the tile. */
  accent: Record<string, string>
  /** One Piece: the Leader, once resolved. */
  leader: OptcgCard | null
}

const MTG_TARGET = 100

/**
 * Fingerprints for a list of decks. Magic reads its colours from the list
 * itself (useManaIdentity's heuristic); One Piece needs its Leader card, so
 * every deck's first line — the Leader, by convention — is resolved in one
 * request for the whole dashboard.
 */
export function useDeckFingerprints(decks: Ref<Deck[]>) {
  const { identity, colorVar, accentStyle } = useManaIdentity()
  const { locale } = useLocale()
  const leaders = shallowRef(new Map<string, OptcgCard | null>())

  const leaderNumbers = computed(() => [...new Set(decks.value
    .filter(d => d.game === 'optcg')
    .map(d => parseOptcgDecklist(d.raw).mainboard[0]?.name)
    .filter((n): n is string => !!n))].sort())

  watch([leaderNumbers, locale], async ([numbers, lang], old) => {
    const langChanged = old && old[1] !== lang
    const missing = langChanged ? numbers : numbers.filter(n => !leaders.value.has(n))
    if (!missing.length)
      return
    try {
      const { cards } = await $fetch<{ cards: (OptcgCard | null)[] }>('/api/optcg/resolve', {
        method: 'POST',
        body: { lang, entries: missing.map(number => ({ number })) },
      })
      const next = new Map(langChanged ? [] : leaders.value)
      missing.forEach((n, i) => next.set(n, cards[i] ?? null))
      leaders.value = next
    }
    catch (err) {
      console.error('[dashboard] leaders', err)
    }
  }, { immediate: true })

  function mtg(deck: Deck): DeckFingerprint {
    const { mainboard, sideboard } = parseMtgDecklist(deck.raw)
    const count = totalCards(mainboard) + totalCards(sideboard)
    const colors = identity(deck.raw)
    return {
      count,
      target: MTG_TARGET,
      complete: count >= MTG_TARGET,
      dots: colors.map(colorVar),
      label: colors.join('').toUpperCase(),
      accent: accentStyle(colors),
      leader: null,
    }
  }

  function optcg(deck: Deck): DeckFingerprint {
    const entries = parseOptcgDecklist(deck.raw).mainboard
    const first = entries[0]
    const leader = first ? leaders.value.get(first.name) ?? null : null
    const isLeader = leader?.category === 'Leader'
    const count = totalCards(entries) - (isLeader ? first!.quantity : 0)
    const colors = isLeader ? leader!.colors : []
    return {
      count,
      target: DECK_SIZE,
      complete: isLeader && count === DECK_SIZE,
      dots: colors.map(c => OPTCG_COLOR_HEX[c]),
      label: isLeader ? leader!.name : '',
      accent: optcgAccentStyle(colors),
      leader: isLeader ? leader : null,
    }
  }

  const fingerprints = computed(() => new Map(decks.value.map(d => [d.id, d.game === 'optcg' ? optcg(d) : mtg(d)])))
  return { fingerprints }
}
