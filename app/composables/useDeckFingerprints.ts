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

  // The Leader is written first; a list pasted elsewhere may have it further
  // down. First lines are asked for first; a deck whose first line is not a
  // Leader then has its other numbers looked up.
  const numbersToKnow = computed(() => {
    const out = new Set<string>()
    for (const d of decks.value) {
      if (d.game !== 'optcg')
        continue
      const numbers = parseOptcgDecklist(d.raw).mainboard.map(e => e.name)
      const first = numbers[0]
      if (!first)
        continue
      out.add(first)
      const known = leaders.value.get(first)
      if (leaders.value.has(first) && known?.category !== 'Leader')
        numbers.forEach(n => out.add(n))
    }
    return [...out].sort()
  })

  const BATCH = 120
  watch([numbersToKnow, locale], async ([numbers, lang], old) => {
    const langChanged = old && old[1] !== lang
    const missing = langChanged ? numbers : numbers.filter(n => !leaders.value.has(n))
    if (!missing.length)
      return
    try {
      const next = new Map(langChanged ? [] : leaders.value)
      for (let i = 0; i < missing.length; i += BATCH) {
        const batch = missing.slice(i, i + BATCH)
        const { cards } = await $fetch<{ cards: (OptcgCard | null)[] }>('/api/optcg/resolve', {
          method: 'POST',
          body: { lang, entries: batch.map(number => ({ number })) },
        })
        batch.forEach((n, k) => next.set(n, cards[k] ?? null))
      }
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
    const line = entries.find(e => leaders.value.get(e.name)?.category === 'Leader')
    const leader = line ? leaders.value.get(line.name) ?? null : null
    const isLeader = !!line
    const count = totalCards(entries) - (line ? line.quantity : 0)
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
