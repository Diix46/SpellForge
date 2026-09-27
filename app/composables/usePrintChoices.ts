import type { GameId } from '#shared/game'
import type { PrintChoice } from '~/composables/useCollection'
import { collectionClient } from '~/utils/games/collection'

/**
 * The printings of one card to pick a copy from (the add dialog, the copy
 * sheet), the game's own way (utils/games/collection.ts).
 */
export function usePrintChoices(game: GameId) {
  const { locale } = useLocale()
  const client = collectionClient(game)

  function loadPrints(key: string, copyLang: 'fr' | 'en'): Promise<PrintChoice[]> {
    return client.prints(key, copyLang, locale.value === 'fr' ? 'fr' : 'en')
  }

  /** Printings re-keyed for another copy language (where the language is part of the id). */
  function relang(prints: PrintChoice[], lang: 'fr' | 'en'): PrintChoice[] {
    return client.language === 'printing' ? prints.map(p => ({ ...p, printingId: client.relang(p.printingId, lang), lang })) : prints
  }

  return { loadPrints, relang }
}
