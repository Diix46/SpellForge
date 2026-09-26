import type { Client } from '@libsql/client'
import type { PrintOption } from '../../../shared/mtg/prints'
import { FINISHES } from '../../../shared/collection'
import { stylesOf } from '../../../shared/mtg/prints'
import { isRecomposed } from '../images/recomposed'
import { buildPrintsQuery } from './mtg-query'
import { imageUrl } from './mtg-shape'

// The columns a database handle's printings have. A database built by an
// older ingest is still served while the new one builds: without `style`
// (schema 3) its printings read as regular frames, without `finishes`
// (schema 4) as nonfoil only, until then.
const knownColumns = new WeakMap<Client, Promise<Set<string>>>()
function printingColumns(db: Client): Promise<Set<string>> {
  let known = knownColumns.get(db)
  if (!known) {
    known = db.execute('SELECT name FROM pragma_table_info(\'printings\')')
      .then(r => new Set(r.rows.map(row => String(row.name))))
      .catch(() => {
        // A busy database, say: ask again next time rather than for the day.
        knownColumns.delete(db)
        return new Set<string>()
      })
    knownColumns.set(db, known)
  }
  return known
}

/**
 * Every printing of one card that can show in `lang` (see buildPrintsQuery),
 * newest first; with `withEnglish`, the English ones follow.
 */
/** The finishes of a `finishes` bit mask (nonfoil, foil, etched). */
function finishesOf(mask: unknown) {
  const m = Number(mask ?? 1) || 1
  return FINISHES.filter((_, i) => m & (1 << i))
}

export async function listPrints(db: Client, name: string, lang: string, withEnglish = false): Promise<PrintOption[]> {
  const columns = await printingColumns(db)
  const { rows } = await db.execute(buildPrintsQuery(name, lang, withEnglish, columns.has('style'), columns.has('finishes')))
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
      priceEur: typeof r.twin_price_eur === 'number' ? r.twin_price_eur.toFixed(2) : typeof r.price_eur === 'number' ? r.price_eur.toFixed(2) : null,
      promo: !!r.promo,
      highres: !!r.is_highres,
      // A sharp French card can be asked for this printing ("[HD]").
      recomposable: r.lang === 'fr' && isRecomposed(id),
      releasedAt: r.released_at == null ? null : String(r.released_at),
      artist: r.artist == null ? null : String(r.artist),
      styles: stylesOf(Number(r.style) || 0),
      finishes: finishesOf(r.finishes),
      priceEurFoil: typeof r.price_eur_foil === 'number' ? r.price_eur_foil.toFixed(2) : null,
      rarity: r.rarity == null ? null : String(r.rarity),
    }
  })
}
