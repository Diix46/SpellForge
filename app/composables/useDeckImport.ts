import type { GameId } from '#shared/game'
import { totalCards } from '#shared/decklist'
import { parseMtgDecklist } from '#shared/mtg/decklist'
import { optcgLine, orderOptcgEntries, parseOptcgDecklist } from '#shared/optcg/decklist'
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
      name: leaderName ? `${t('optcg.library.newDeckName')} ${leaderName}`.trim() : t('nav.newDeck'),
      raw: [...ordered, ...errors].join('\n'),
      count: totalCards(mainboard),
    }
  }

  return { fromUrl, fromText }
}
