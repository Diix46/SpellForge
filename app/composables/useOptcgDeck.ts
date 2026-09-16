import type { MaybeRefOrGetter } from 'vue'
import type { DeckEntry } from '#shared/decklist'
import type { OptcgDeckLine } from '#shared/optcg/deck'
import type { OptcgCard } from '#shared/optcg/types'
import { computed, ref, shallowRef, toValue, watch } from 'vue'
import { canAdd, copiesOf, deckStats, findLeader, validateLines } from '#shared/optcg/deck'
import { optcgLine, orderOptcgEntries, parseOptcgDecklist } from '#shared/optcg/decklist'
import { MAX_COPIES } from '#shared/optcg/rules'

/** The art a line shows: its pinned art, or its card number. */
const lineKey = (e: DeckEntry) => e.art ?? e.name

export type AddResult = ReturnType<typeof canAdd>

/**
 * A One Piece deck being edited. The decklist text stays the source of truth
 * (what is saved, shared and copied); this parses it into lines, resolves each
 * one to a card through the local database, and writes every edit back as text,
 * Leader first.
 */
export function useOptcgDeck(options: {
  raw: { get: () => string, set: (v: string) => void }
  lang: MaybeRefOrGetter<'fr' | 'en'>
}) {
  const entries = ref<DeckEntry[]>([])
  const unreadable = ref<string[]>([])
  // Resolved cards by `${art-or-number}|${lang}`; a miss is stored as null so an
  // unknown number is not asked for again.
  const cards = shallowRef(new Map<string, OptcgCard | null>())
  const resolving = ref(false)

  const cacheKey = (e: DeckEntry) => `${lineKey(e)}|${toValue(options.lang)}`

  const lines = computed<OptcgDeckLine[]>(() =>
    entries.value.map(entry => ({ entry, card: cards.value.get(cacheKey(entry)) ?? null })),
  )
  const leader = computed(() => findLeader(lines.value))
  const validation = computed(() => validateLines(lines.value))
  const stats = computed(() => deckStats(lines.value))
  /** Lines still waiting for their card, or pointing at an unknown number. */
  const pending = computed(() => lines.value.filter(l => !cards.value.has(cacheKey(l.entry))))
  const unknown = computed(() => lines.value.filter(l => cards.value.has(cacheKey(l.entry)) && !l.card))

  function load() {
    const parsed = parseOptcgDecklist(options.raw.get())
    entries.value = parsed.mainboard
    unreadable.value = parsed.errors
  }

  function save() {
    const isLeader = (number: string) => lines.value.some(l => l.entry.name === number && l.card?.category === 'Leader')
    options.raw.set(orderOptcgEntries(entries.value, isLeader).map(optcgLine).join('\n'))
  }

  let token = 0
  async function resolve() {
    const lang = toValue(options.lang)
    const missing = entries.value.filter(e => !cards.value.has(cacheKey(e)))
    if (!missing.length)
      return
    const id = ++token
    resolving.value = true
    try {
      const refs = [...new Map(missing.map(e => [lineKey(e), e])).values()]
      const { cards: found } = await $fetch<{ cards: (OptcgCard | null)[] }>('/api/optcg/resolve', {
        method: 'POST',
        body: { lang, entries: refs.map(e => (e.art ? { number: e.name, id: e.art } : { number: e.name })) },
      })
      if (id !== token)
        return
      const next = new Map(cards.value)
      refs.forEach((e, i) => next.set(`${lineKey(e)}|${lang}`, found[i] ?? null))
      cards.value = next
    }
    catch (err) {
      console.error('[optcg deck] resolve failed', err)
    }
    finally {
      if (id === token)
        resolving.value = false
    }
  }

  // New lines, or a language switch, resolve what is not known yet.
  watch(() => [entries.value.map(cacheKey).join(','), toValue(options.lang)], resolve)

  /** Seed the cache with a card the player picked, so it shows at once. */
  function remember(card: OptcgCard, art?: string) {
    const next = new Map(cards.value)
    next.set(`${art ?? card.number}|${toValue(options.lang)}`, card)
    cards.value = next
  }

  /**
   * Add one copy. `pinArt` keeps the exact art shown, for a choice the player
   * made in the card sheet; from the search, the line follows the number's
   * usual art — which may itself be an alternate one, the only print in French.
   */
  function add(card: OptcgCard, pinArt = false): AddResult {
    const verdict = canAdd(lines.value, card)
    if (!verdict.ok)
      return verdict
    const art = pinArt && card.id !== card.number && !card.id.includes('_r') ? card.id : undefined
    remember(card, art)
    if (verdict.asLeader) {
      // One Leader: a new one replaces the old.
      const old = leader.value?.entry
      entries.value = [{ quantity: 1, name: card.number, art }, ...entries.value.filter(e => e !== old)]
    }
    else {
      const same = entries.value.find(e => e.name === card.number && e.art === art)
      if (same)
        same.quantity += 1
      else entries.value.push({ quantity: 1, name: card.number, art })
    }
    save()
    return verdict
  }

  function setQuantity(entry: DeckEntry, quantity: number) {
    if (quantity <= 0) {
      remove(entry)
      return
    }
    // The four-copy limit spans every art of the number.
    const others = copiesOf(lines.value, entry.name) - entry.quantity
    entry.quantity = Math.min(quantity, Math.max(1, MAX_COPIES - others))
    save()
  }

  function remove(entry: DeckEntry) {
    entries.value = entries.value.filter(e => e !== entry)
    save()
  }

  /** Swap the art of a line; the same art already in the deck absorbs it. */
  function setArt(entry: DeckEntry, card: OptcgCard) {
    const art = card.id === card.number ? undefined : card.id
    remember(card, art)
    const twin = entries.value.find(e => e !== entry && e.name === entry.name && e.art === art)
    if (twin) {
      twin.quantity += entry.quantity
      entries.value = entries.value.filter(e => e !== entry)
    }
    else {
      entry.art = art
    }
    save()
  }

  /** Quantity of a card number in the deck, all arts together. */
  function quantityOf(number: string): number {
    return copiesOf(lines.value, number)
  }

  return {
    entries,
    unreadable,
    lines,
    leader,
    validation,
    stats,
    pending,
    unknown,
    resolving,
    load,
    resolve,
    add,
    setQuantity,
    remove,
    setArt,
    quantityOf,
  }
}
