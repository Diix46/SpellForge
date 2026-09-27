import type { DeckEntry } from '#shared/decklist'
import type { GameId } from '#shared/game'
import type { TcgLine } from '#shared/tcg/deck'
import type { TcgCard, TcgGameId } from '#shared/tcg/types'
import { totalCards } from '#shared/decklist'
import { parseMtgDecklist } from '#shared/mtg/decklist'
import { optcgLine, orderOptcgEntries, parseOptcgDecklist } from '#shared/optcg/decklist'
import { isYdk, parseForeignLines, parseTcgDecklist, parseYdk, writeTcgDecklist } from '#shared/tcg/deck'
import { TCG_RULES } from '#shared/tcg/rules'
import { isTcgGame } from '#shared/tcg/types'
import { errMessage } from '~/composables/useErrors'

/** A list ready to become a deck, or to replace the one open. */
export interface ImportedList {
  name: string
  raw: string
  /** Cards counted the way the game counts them (One Piece leaves the Leader in). */
  count: number
  /** Where it came from, when it came from a link. */
  source?: string
}

/**
 * Reads a deck from a public link or from a pasted list, for either game. The
 * dialog (DeckIoModal) decides what to do with the result: a new deck, or the
 * list of the deck already open.
 *
 * Failures come back as an Error whose message is meant to be read by a human:
 * the server names the case (`code`), the wording is ours.
 */
export function useDeckImport() {
  const { locale, t } = useLocale()

  /** EDHREC or Archidekt link → a Magic list. */
  async function fromUrl(url: string): Promise<ImportedList> {
    try {
      const result = await $fetch<{ name: string, raw: string, source: string, cardCount: number }>('/api/import', {
        method: 'POST',
        body: { url: url.trim() },
      })
      return { name: result.name, raw: result.raw, count: result.cardCount, source: result.source }
    }
    catch (err: unknown) {
      const code = (err as { data?: { data?: { code?: unknown } } } | null)?.data?.data?.code
      const known = typeof code === 'string' ? t(`modal.importError.${code}`) : ''
      throw new Error(known && !known.startsWith('modal.') ? known : errMessage(err) || t('modal.unknownError'))
    }
  }

  /**
   * A pasted list. One Piece lists are resolved first, so the Leader moves to
   * the front (the tile and the rules read it there) and the deck takes its
   * name; unreadable lines are kept at the end for the workshop to show.
   */
  async function fromText(game: GameId, text: string): Promise<ImportedList> {
    if (game === 'mtg') {
      const parsed = parseMtgDecklist(text)
      if (!parsed.mainboard.length && !parsed.sideboard.length)
        throw new Error(t('modal.importListEmpty'))
      return { name: t('nav.newDeck'), raw: text, count: totalCards(parsed.mainboard) }
    }

    if (isTcgGame(game)) {
      // Prism's own lines first; the others as another app writes them,
      // matched to printings by the server.
      const rules = TCG_RULES[game]
      if (isYdk(text))
        return fromYdk(game, text)
      const own = parseTcgDecklist(text, rules.zones)
      const foreign = parseForeignLines(own.errors)
      const rest = [...foreign.rest]
      const entries = [...own.mainboard]
      // Lines read as another app writes them: their zone comes from the
      // rules once their cards are known (a heading such as "Champion:" says
      // nothing Prism can trust).
      const placed = new Set<DeckEntry>()
      if (foreign.lines.length) {
        const { ids } = await $fetch<{ ids: (string | null)[] }>(`/api/tcg/${game}/match`, {
          method: 'POST',
          body: { lang: locale.value, lines: foreign.lines.map(l => ({ name: l.name, set: l.set, number: l.number })) },
        }).catch((err: unknown) => {
          throw new Error(errMessage(err) || t('modal.unknownError'))
        })
        foreign.lines.forEach((l, i) => {
          const id = ids[i]
          if (!id) {
            rest.push(`${l.quantity} ${l.name}${l.set ? ` ${l.set} ${l.number ?? ''}` : ''}`.trim())
            return
          }
          const same = entries.find(e => e.name === id && placed.has(e))
          if (same) {
            same.quantity += l.quantity
            return
          }
          const entry: DeckEntry = { quantity: l.quantity, name: id }
          entries.push(entry)
          placed.add(entry)
        })
      }
      if (!entries.length)
        throw new Error(t('modal.importListEmpty'))
      if (placed.size)
        await placeByRules(game, entries, placed)
      return { name: t('nav.newDeck'), raw: writeTcgDecklist(entries, rules.zones, rest), count: totalCards(entries) }
    }

    const { mainboard, errors } = parseOptcgDecklist(text)
    if (!mainboard.length)
      throw new Error(t('modal.importListEmpty'))
    const { cards } = await $fetch<{ cards: ({ name?: string, category: string } | null)[] }>('/api/optcg/resolve', {
      method: 'POST',
      body: { lang: locale.value, entries: mainboard.map(e => ({ number: e.name })) },
    }).catch((err: unknown) => {
      throw new Error(errMessage(err) || t('modal.unknownError'))
    })
    const leaders = new Set(mainboard.filter((_, i) => cards[i]?.category === 'Leader').map(e => e.name))
    const ordered = orderOptcgEntries(mainboard, n => leaders.has(n)).map(optcgLine)
    const leaderIndex = mainboard.findIndex(e => leaders.has(e.name))
    const leaderName = leaderIndex >= 0 ? cards[leaderIndex]?.name ?? '' : ''
    return {
      name: leaderName || t('nav.newDeck'),
      raw: [...ordered, ...errors].join('\n'),
      count: totalCards(mainboard),
    }
  }

  /** Each entry of `todo` in the zone the rules give its card, in list order. */
  async function placeByRules(game: TcgGameId, entries: DeckEntry[], todo: Set<DeckEntry>) {
    const rules = TCG_RULES[game]
    const ids = [...new Set(entries.map(e => e.name))]
    const { cards } = await $fetch<{ cards: (TcgCard | null)[] }>(`/api/tcg/${game}/resolve`, { method: 'POST', body: { lang: locale.value, ids } })
      .catch(() => ({ cards: [] as (TcgCard | null)[] }))
    const byId = new Map(ids.map((id, i) => [id, cards[i] ?? null]))
    const lines: TcgLine[] = []
    for (const entry of entries) {
      const card = byId.get(entry.name) ?? null
      if (card && todo.has(entry)) {
        const zone = rules.zoneFor(card, lines)
        if (zone !== rules.zones[0]!.id)
          entry.zone = zone
      }
      lines.push({ entry, card })
    }
  }

  /** A YDK file: its passcodes matched to printings, each in its zone. */
  async function fromYdk(game: TcgGameId, text: string): Promise<ImportedList> {
    const rules = TCG_RULES[game]
    const lines = parseYdk(text)
    if (!lines.length)
      throw new Error(t('modal.importListEmpty'))
    const { ids } = await $fetch<{ ids: (string | null)[] }>(`/api/tcg/${game}/match`, {
      method: 'POST',
      body: { lang: locale.value, lines: lines.map(l => ({ name: '', code: l.code })) },
    }).catch((err: unknown) => {
      throw new Error(errMessage(err) || t('modal.unknownError'))
    })
    const main = rules.zones[0]!.id
    const entries: DeckEntry[] = []
    const rest: string[] = []
    lines.forEach((l, i) => {
      const id = ids[i]
      if (!id)
        return rest.push(`${l.quantity} ${l.code}`)
      const zone = l.zone === main ? undefined : l.zone
      const same = entries.find(e => e.name === id && e.zone === zone)
      if (same)
        same.quantity += l.quantity
      else
        entries.push({ quantity: l.quantity, name: id, ...(zone ? { zone } : {}) })
    })
    return { name: t('nav.newDeck'), raw: writeTcgDecklist(entries, rules.zones, rest), count: totalCards(entries) }
  }

  return { fromUrl, fromText }
}
