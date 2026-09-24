import type { Client } from '@libsql/client'
import type { PrintOption } from '../../../shared/mtg/prints'
import { buildPrintsQuery } from './mtg-query'
import { imageUrl } from './mtg-shape'

/**
 * Every printing of one card that can show in `lang` (see buildPrintsQuery),
 * newest first; with `withEnglish`, the English ones follow.
 */
export async function listPrints(db: Client, name: string, lang: string, withEnglish = false): Promise<PrintOption[]> {
  const { rows } = await db.execute(buildPrintsQuery(name, lang, withEnglish))
  return rows.map((r) => {
    const id = String(r.id)
    return {
      id,
      set: String(r.set_code),
      setName: String(r.set_name ?? ''),
      collectorNumber: String(r.collector_number),
      lang: String(r.lang),
      // The front image version covers both single- and double-faced printings.
      image: imageUrl('normal', 'front', id, r.img_version),
      imageLarge: imageUrl('large', 'front', id, r.img_version),
      // Each printing shows its own price, not the card's cheapest.
      priceEur: typeof r.price_eur === 'number' ? r.price_eur.toFixed(2) : null,
      promo: !!r.promo,
      highres: !!r.is_highres,
      releasedAt: r.released_at == null ? null : String(r.released_at),
    }
  })
}
