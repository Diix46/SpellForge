/**
 * The cards behind a collection's copies, read from the card databases by
 * printing id, in the collection's own shape (shared/collection.ts).
 */
import type { Client, InValue } from '@libsql/client'
import type { CollectionCard, Finish } from '../../../shared/collection'
import type { GameId } from '../../../shared/game'
import { FINISHES, parseOptcgPrintingId } from '../../../shared/collection'
import { useMtgCardsDb, useOptcgCardsDb } from '../cards/db'
import { imageUrl, setIconPath } from '../cards/mtg-shape'
import { buildOptcgByIdQuery } from '../cards/optcg-query'
import { toOptcgCard } from '../cards/optcg-shape'

const COLOR_LETTERS = ['W', 'U', 'B', 'R', 'G'] as const
const CHUNK = 400

function colorsOf(mask: unknown): string[] {
  const m = Number(mask ?? 0)
  return COLOR_LETTERS.filter((_, i) => m & (1 << i))
}

function finishesOf(mask: unknown): Finish[] {
  const m = Number(mask ?? 1)
  const out = FINISHES.filter((_, i) => m & (1 << i))
  return out.length ? out : ['nonfoil']
}

const num = (v: unknown) => (v == null ? null : Number(v))
const str = (v: unknown) => (v == null ? null : String(v))

async function mtgCards(db: Client, ids: readonly string[]): Promise<Map<string, CollectionCard>> {
  const out = new Map<string, CollectionCard>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { rows } = await db.execute({
      sql: `SELECT p.id, p.lang, p.set_code, p.set_name, p.collector_number, p.rarity, p.released_at,
                   p.printed_name, p.printed_type_line, p.finishes, p.img_version,
                   COALESCE(p.price_eur, en.price_eur) AS price_eur,
                   COALESCE(p.price_eur_foil, en.price_eur_foil) AS price_eur_foil,
                   o.name, o.type_line, o.mana_cost, o.identity_mask, s.icon AS set_icon,
                   (SELECT f.img_version FROM card_faces f WHERE f.printing_id = p.id AND f.face_index = 0) AS face_img
              FROM printings p
              JOIN oracle_cards o ON o.oracle_id = p.oracle_id
              LEFT JOIN sets s ON s.code = p.set_code
              -- Cardmarket prices a printing, whatever its language: a French
              -- one (rarely priced) takes its English twin's price.
              LEFT JOIN printings en ON en.set_code = p.set_code AND en.collector_number = p.collector_number
                                    AND en.lang = 'en' AND p.lang != 'en'
             WHERE p.id IN (${chunk.map(() => '?').join(',')})`,
      args: chunk as InValue[],
    })
    for (const r of rows) {
      const id = String(r.id)
      const version = r.img_version ?? r.face_img
      out.set(id, {
        name: String(r.name),
        printedName: str(r.printed_name),
        lang: r.lang === 'fr' ? 'fr' : 'en',
        set: String(r.set_code),
        setName: str(r.set_name),
        // Served by us (masks need the same origin), when Scryfall has one.
        setIcon: setIconPath(r.set_icon),
        number: String(r.collector_number),
        rarity: str(r.rarity),
        releasedAt: str(r.released_at),
        typeLine: str(r.printed_type_line) ?? str(r.type_line),
        colors: colorsOf(r.identity_mask),
        manaCost: str(r.mana_cost),
        image: imageUrl('normal', 'front', id, version),
        thumb: imageUrl('normal', 'front', id, version, 'thumb'),
        price: num(r.price_eur),
        priceFoil: num(r.price_eur_foil),
        finishes: finishesOf(r.finishes),
      })
    }
  }
  return out
}

async function optcgCards(db: Client, printingIds: readonly string[]): Promise<Map<string, CollectionCard>> {
  const out = new Map<string, CollectionCard>()
  const wanted = printingIds.map(parseOptcgPrintingId).filter(x => x != null)
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const chunk = wanted.slice(i, i + CHUNK)
    // Both languages come back; each copy keeps the row of its own language,
    // else the other one (a French copy of an art only known in English).
    const { rows } = await db.execute(buildOptcgByIdQuery([...new Set(chunk.map(w => w.artId))], 'fr'))
    const byArt = new Map<string, Map<string, ReturnType<typeof toOptcgCard>>>()
    for (const r of rows) {
      const card = toOptcgCard(r)
      const langs = byArt.get(card.id) ?? new Map()
      if (!langs.has(card.lang))
        langs.set(card.lang, card)
      byArt.set(card.id, langs)
    }
    for (const w of chunk) {
      const langs = byArt.get(w.artId)
      const card = langs?.get(w.lang) ?? langs?.values().next().value
      if (!card)
        continue
      out.set(`${w.lang}:${w.artId}`, {
        name: card.name,
        printedName: null,
        lang: w.lang,
        set: card.set ?? card.number.split('-')[0] ?? '',
        setName: null,
        setIcon: null,
        number: card.number,
        rarity: card.rarity,
        releasedAt: null,
        typeLine: card.category,
        colors: card.colors,
        manaCost: card.cost == null ? null : String(card.cost),
        image: card.image,
        thumb: card.thumb,
        price: null,
        priceFoil: null,
        finishes: ['nonfoil'],
      })
    }
  }
  return out
}

/** The cards of these printings (unknown ids are left out). */
export function collectionCards(game: GameId, printingIds: readonly string[]): Promise<Map<string, CollectionCard>> {
  if (!printingIds.length)
    return Promise.resolve(new Map())
  return game === 'mtg' ? mtgCards(useMtgCardsDb(), printingIds) : optcgCards(useOptcgCardsDb(), printingIds)
}
