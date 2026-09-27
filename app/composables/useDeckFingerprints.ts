import type { Ref } from 'vue'
import type { OptcgCard } from '#shared/optcg/types'
import type { TcgCard, TcgGameId } from '#shared/tcg/types'
import type { Deck } from './useDeckStore'
import type { ManaColor } from './useMtg'
import { computed, shallowRef, watch } from 'vue'
import { totalCards } from '#shared/decklist'
import { mtgLine, parseMtgDecklist } from '#shared/mtg/decklist'
import { parseOptcgDecklist } from '#shared/optcg/decklist'
import { DECK_SIZE } from '#shared/optcg/rules'
import { parseTcgDecklist, zoneCount } from '#shared/tcg/deck'
import { TCG_RULES } from '#shared/tcg/rules'
import { isTcgGame, TCG_GAME_IDS } from '#shared/tcg/types'
import { TCG_UI, tcgCover } from '~/utils/games/tcg'
import { OPTCG_COLOR_HEX, optcgAccentStyle } from '~/utils/optcgColors'
import { isCommanderType } from './useMtg'

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
  /** The commander's art (Magic: its art crop) or the Leader's card (One Piece), once resolved. */
  art: string | null
  /** Magic: the colour identity as mana symbols ("R", "G"…, "C" colourless). */
  mana: string[]
  /** The commander's or Leader's name, once resolved: a deck without a name of its own shows it. */
  lead: string
}

/** What a Magic tile shows of its commander. */
interface Commander { name: string, art: string | null, identity: string[], canLead: boolean }

const MTG_TARGET = 100

// The fields read from a resolved Magic card (the Scryfall-shaped answer).
interface MtgCardLike {
  name: string
  printed_name?: string
  type_line?: string
  color_identity?: string[]
  image_uris?: { art_crop?: string }
  card_faces?: { image_uris?: { art_crop?: string } }[]
}

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
  // Magic: each deck's commander line (its pin kept: the art is the one chosen).
  const commanders = shallowRef(new Map<string, Commander | null>())

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

  // The chosen commander; without a choice, the first card (lists put the
  // commander first), kept only if it can lead (see mtg below).
  function commanderEntry(deck: Deck) {
    const { mainboard, commanders: names } = parseMtgDecklist(deck.raw)
    const key = names?.[0]?.trim().toLowerCase()
    return key ? mainboard.find(e => e.name.trim().toLowerCase() === key) ?? null : mainboard[0] ?? null
  }

  // Every Magic deck's commander, in one request for the whole dashboard.
  const commanderLines = computed(() => {
    const out = new Set<string>()
    for (const d of decks.value) {
      const entry = d.game === 'mtg' ? commanderEntry(d) : null
      if (entry)
        out.add(mtgLine({ ...entry, quantity: 1 }))
    }
    return [...out].sort()
  })
  watch([commanderLines, locale], async ([lines, lang], old) => {
    const langChanged = old && old[1] !== lang
    const missing = langChanged ? lines : lines.filter(l => !commanders.value.has(l))
    if (!missing.length)
      return
    try {
      const entries = missing.map(l => parseMtgDecklist(l).mainboard[0]!)
      const { cards } = await $fetch<{ cards: ({ card: MtgCardLike | null } | null)[] }>('/api/cards/resolve', {
        method: 'POST',
        body: {
          lang,
          entries: entries.map(e => ({ name: e.name, set: e.set, collectorNumber: e.collectorNumber, ...(e.lang ? { lang: e.lang } : {}), ...(e.hd ? { hd: true } : {}) })),
        },
      })
      const next = new Map(langChanged ? [] : commanders.value)
      missing.forEach((l, k) => {
        const c = cards[k]?.card
        next.set(l, c
          ? {
              name: c.printed_name || c.name,
              art: c.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.art_crop ?? null,
              identity: (c.color_identity ?? []).map(x => x.toUpperCase()),
              canLead: isCommanderType(c.type_line ?? ''),
            }
          : null)
      })
      commanders.value = next
    }
    catch (err) {
      console.error('[dashboard] commanders', err)
    }
  }, { immediate: true })

  function mtg(deck: Deck): DeckFingerprint {
    const { mainboard, sideboard } = parseMtgDecklist(deck.raw)
    const count = totalCards(mainboard) + totalCards(sideboard)
    const entry = commanderEntry(deck)
    const chosen = !!parseMtgDecklist(deck.raw).commanders?.length
    const found = entry ? commanders.value.get(mtgLine({ ...entry, quantity: 1 })) ?? null : null
    const commander = found && (chosen || found.canLead) ? found : null
    // The commander's identity when known; the list's colours until then.
    const colors = commander
      ? commander.identity.map(c => c.toLowerCase()).filter((c): c is ManaColor => 'wubrg'.includes(c))
      : identity(deck.raw)
    return {
      count,
      target: MTG_TARGET,
      complete: count >= MTG_TARGET,
      dots: colors.map(colorVar),
      label: commander?.name ?? colors.join('').toUpperCase(),
      accent: accentStyle(colors),
      leader: null,
      art: commander?.art ?? null,
      mana: colors.length ? colors.map(c => c.toUpperCase()) : commander ? ['C'] : [],
      lead: commander?.name ?? '',
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
      art: isLeader ? leader!.image : null,
      mana: [],
      lead: isLeader ? leader!.name : '',
    }
  }

  // The generic engine's decks: every printing of every deck, one request per game.
  const tcgCards = shallowRef(new Map<string, TcgCard | null>())
  const tcgIds = computed(() => {
    const out: Partial<Record<TcgGameId, Set<string>>> = {}
    for (const d of decks.value) {
      if (!isTcgGame(d.game))
        continue
      const set = out[d.game] ??= new Set<string>()
      for (const e of parseTcgDecklist(d.raw, TCG_RULES[d.game].zones).mainboard)
        set.add(e.name)
    }
    return TCG_GAME_IDS.flatMap(g => [...(out[g] ?? [])].sort().map(id => `${g}|${id}`))
  })
  watch([tcgIds, locale], async ([keys, lang], old) => {
    const langChanged = old && old[1] !== lang
    const missing = langChanged ? keys : keys.filter(k => !tcgCards.value.has(k))
    if (!missing.length)
      return
    try {
      const next = new Map(langChanged ? [] : tcgCards.value)
      for (const game of TCG_GAME_IDS) {
        const ids = missing.filter(k => k.startsWith(`${game}|`)).map(k => k.slice(game.length + 1))
        for (let i = 0; i < ids.length; i += BATCH) {
          const batch = ids.slice(i, i + BATCH)
          const { cards } = await $fetch<{ cards: (TcgCard | null)[] }>(`/api/tcg/${game}/resolve`, { method: 'POST', body: { lang, ids: batch } })
          batch.forEach((id, k) => next.set(`${game}|${id}`, cards[k] ?? null))
        }
      }
      tcgCards.value = next
    }
    catch (err) {
      console.error('[dashboard] cards', err)
    }
  }, { immediate: true })

  function tcg(deck: Deck, game: TcgGameId): DeckFingerprint {
    const rules = TCG_RULES[game]
    const lines = parseTcgDecklist(deck.raw, rules.zones).mainboard.map(entry => ({ entry, card: tcgCards.value.get(`${game}|${entry.name}`) ?? null }))
    const main = rules.zones[0]!
    const count = zoneCount(lines, main.id, rules)
    const types = new Map<string, number>()
    for (const l of lines) {
      for (const ty of l.card?.types ?? [])
        types.set(ty, (types.get(ty) ?? 0) + l.entry.quantity)
    }
    const top = [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ty]) => TCG_UI[game].typeColor[ty] ?? '#999')
    const cover = tcgCover(game, lines)?.card ?? null
    return {
      count,
      target: main.max,
      complete: count >= main.min && count <= main.max,
      dots: top,
      label: cover?.name ?? '',
      accent: top[0] ? { '--deck-accent': top[0] } : {},
      leader: null,
      art: cover?.image || null,
      mana: [],
      lead: cover?.name ?? '',
    }
  }

  const fingerprints = computed(() => new Map(decks.value.map(d => [d.id, isTcgGame(d.game) ? tcg(d, d.game) : d.game === 'optcg' ? optcg(d) : mtg(d)])))
  return { fingerprints }
}
