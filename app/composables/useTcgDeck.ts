import type { MaybeRefOrGetter } from 'vue'
import type { DeckEntry } from '#shared/decklist'
import type { TcgLine } from '#shared/tcg/deck'
import type { TcgCard, TcgGameId } from '#shared/tcg/types'
import { computed, ref, shallowRef, toValue, watch } from 'vue'
import { canAdd, copiesOf, limitOf, parseTcgDecklist, readTcgFormat, validateTcgDeck, writeTcgDecklist, zoneOf } from '#shared/tcg/deck'
import { TCG_RULES } from '#shared/tcg/rules'

/**
 * A generic-engine deck being edited. The decklist text stays the source of
 * truth (saved, shared, copied); this parses it into lines, resolves each
 * printing through the game's database, and writes every edit back as text.
 */
export function useTcgDeck(options: {
  game: TcgGameId
  raw: { get: () => string, set: (v: string) => void }
  lang: MaybeRefOrGetter<'fr' | 'en'>
}) {
  const rules = TCG_RULES[options.game]
  const entries = ref<DeckEntry[]>([])
  const unreadable = ref<string[]>([])
  // Resolved printings by `${id}|${lang}`; a miss is kept as null.
  const cards = shallowRef(new Map<string, TcgCard | null>())
  const resolving = ref(false)
  /** The format the deck is checked against, kept in the list itself. */
  const format = ref(rules.formats[0] ?? '')

  const key = (id: string, lang = toValue(options.lang)) => `${id}|${lang}`
  // During a language switch a line keeps its card in the other language.
  const lines = computed<TcgLine[]>(() => entries.value.map((entry) => {
    const other = toValue(options.lang) === 'fr' ? 'en' : 'fr'
    return { entry, card: cards.value.get(key(entry.name)) ?? cards.value.get(key(entry.name, other)) ?? null }
  }))
  const validation = computed(() => validateTcgDeck(rules, lines.value, format.value))
  const unknown = computed(() => lines.value.filter(l => cards.value.has(key(l.entry.name)) && !l.card))
  const count = computed(() => entries.value.reduce((n, e) => n + e.quantity, 0))

  function load() {
    const parsed = parseTcgDecklist(options.raw.get(), rules.zones)
    entries.value = parsed.mainboard
    unreadable.value = parsed.errors
    format.value = readTcgFormat(options.raw.get(), rules.formats)
  }

  function save() {
    options.raw.set(writeTcgDecklist(entries.value, rules.zones, unreadable.value, { value: format.value, formats: rules.formats }))
  }

  function setFormat(f: string) {
    if (!rules.formats.includes(f) || f === format.value)
      return
    format.value = f
    save()
  }

  let token = 0
  async function resolve() {
    const lang = toValue(options.lang)
    const missing = [...new Set(entries.value.map(e => e.name).filter(id => !cards.value.has(key(id))))]
    if (!missing.length)
      return
    const id = ++token
    resolving.value = true
    try {
      const { cards: found } = await $fetch<{ cards: (TcgCard | null)[] }>(`/api/tcg/${options.game}/resolve`, { method: 'POST', body: { lang, ids: missing } })
      if (id !== token)
        return
      const next = new Map(cards.value)
      missing.forEach((m, i) => next.set(key(m, lang), found[i] ?? null))
      cards.value = next
    }
    catch (err) {
      console.error(`[${options.game} deck] resolve failed`, err)
    }
    finally {
      if (id === token)
        resolving.value = false
    }
  }
  watch(() => [entries.value.map(e => e.name).join(','), toValue(options.lang)], resolve)

  function remember(card: TcgCard) {
    const next = new Map(cards.value)
    next.set(key(card.id), card)
    cards.value = next
  }

  /** One more copy of this printing, in its zone (or the one asked: the Side Deck). */
  function add(card: TcgCard, into?: string) {
    const verdict = canAdd(rules, lines.value, card, into ?? rules.zoneFor(card))
    if (!verdict.ok)
      return verdict
    remember(card)
    const zone = verdict.zone === rules.zones[0]!.id ? undefined : verdict.zone
    const same = entries.value.find(e => e.name === card.id && e.zone === zone)
    if (same)
      same.quantity += 1
    else
      entries.value.push({ quantity: 1, name: card.id, ...(zone ? { zone } : {}) })
    save()
    return verdict
  }

  function setQuantity(entry: DeckEntry, quantity: number) {
    if (quantity <= 0)
      return remove(entry)
    const card = lines.value.find(l => l.entry === entry)?.card
    // The copy limit spans every printing of the card.
    if (card) {
      const others = copiesOf(lines.value, card.key) - entry.quantity
      quantity = Math.min(quantity, Math.max(1, limitOf(rules, card) - others))
    }
    entry.quantity = quantity
    save()
  }

  function remove(entry: DeckEntry) {
    entries.value = entries.value.filter(e => e !== entry)
    save()
  }

  /** Swap a line's printing for another of the same card; the same printing already listed absorbs it. */
  function setPrinting(entry: DeckEntry, card: TcgCard) {
    remember(card)
    const twin = entries.value.find(e => e !== entry && e.name === card.id && e.zone === entry.zone)
    if (twin) {
      twin.quantity += entry.quantity
      entries.value = entries.value.filter(e => e !== entry)
    }
    else {
      entry.name = card.id
    }
    save()
  }

  /** Copies of a card in the deck (every printing). */
  const quantityOf = (card: TcgCard) => copiesOf(lines.value, card.key)

  return { rules, format, setFormat, entries, unreadable, lines, validation, unknown, resolving, count, load, resolve, add, setQuantity, remove, setPrinting, quantityOf, zoneOf: (e: DeckEntry) => zoneOf(e, rules) }
}
