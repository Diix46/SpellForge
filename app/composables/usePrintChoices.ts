import type { GameId } from '#shared/game'
import type { OptcgPrint } from '#shared/optcg/types'
import type { PrintChoice } from '~/composables/useCollection'
import type { PrintOption } from '~/composables/usePrintings'
import { optcgPrintingId } from '#shared/collection'

/**
 * The printings of one card to pick a copy from (the add dialog, the copy
 * sheet): Magic by its English name, every language; One Piece by its number,
 * each art keyed in the copy's language.
 */
export function usePrintChoices(game: GameId) {
  const { locale } = useLocale()

  async function loadPrints(key: string, copyLang: 'fr' | 'en'): Promise<PrintChoice[]> {
    if (game === 'mtg') {
      const { prints } = await $fetch<{ prints: PrintOption[] }>('/api/cards/prints', { query: { name: key, lang: locale.value, all: '1' } })
      return prints.map(p => ({
        printingId: p.id,
        image: p.image,
        set: p.set,
        setName: p.setName,
        setIcon: p.setIcon ?? null,
        rarity: p.rarity ?? null,
        number: p.collectorNumber,
        lang: p.lang,
        price: p.priceEur,
        finishes: p.finishes?.length ? p.finishes : ['nonfoil'],
        priceFoil: p.priceEurFoil ?? null,
      }))
    }
    const { prints } = await $fetch<{ prints: OptcgPrint[] }>('/api/optcg/prints', { query: { number: key, lang: locale.value } })
    return prints.map(p => ({
      printingId: optcgPrintingId(copyLang, p.id),
      image: p.thumb,
      set: p.set ?? key.split('-')[0] ?? '',
      setName: p.set ?? '',
      setIcon: null,
      rarity: p.rarity,
      number: p.id,
      lang: copyLang,
      price: null,
      finishes: ['nonfoil'],
      priceFoil: null,
    }))
  }

  /** One Piece arts re-keyed for another copy language. */
  function relang(prints: PrintChoice[], lang: 'fr' | 'en'): PrintChoice[] {
    return game === 'optcg' ? prints.map(p => ({ ...p, printingId: optcgPrintingId(lang, p.printingId.split(':')[1]!), lang })) : prints
  }

  return { loadPrints, relang }
}
