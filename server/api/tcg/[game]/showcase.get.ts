/**
 * A game's signature illustrations, for its page backdrop and its 3D room:
 * Yu-Gi-Oh's legendary monsters (their art alone), Riftbound's Legends and
 * Pokémon's illustration rares (their whole card; the client crops the art).
 * One hour of cache: they move with the nightly refresh, rarely.
 */
import type { InValue } from '@libsql/client'
import type { TcgGameId } from '../../../../shared/tcg/types'
import { cardPath } from '../../../../shared/game'
import { useTcgDb } from '../../../utils/tcg/db'
import { tcgGame, tcgLang } from '../../../utils/tcg/params'
import { buildByIdQuery, toTcgCard } from '../../../utils/tcg/query'

export interface ShowcaseArt {
  name: string
  /** The illustration: its own image, or the whole card when there is none. */
  image: string
  /** True when `image` is the whole card, the art to be cropped from it. */
  card: boolean
  path: string
}

const COUNT = 8
// Yu-Gi-Oh's legends, by passcode: Dark Magician, Blue-Eyes, Exodia, Red-Eyes,
// Dark Magician Girl, Black Luster Soldier, Slifer, Obelisk, Ra, Stardust.
const YGO_LEGENDS = ['46986414', '89631139', '33396948', '74677422', '38033121', '5405694', '10000020', '10000000', '10000010', '44508094']

async function ids(game: TcgGameId): Promise<string[]> {
  const db = useTcgDb(game)
  if (game === 'yugioh') {
    const marks = YGO_LEGENDS.map(() => '?').join(',')
    const { rows } = await db.execute({
      sql: `SELECT id FROM (
              SELECT c.id, c.code, ROW_NUMBER() OVER (PARTITION BY c.code ORDER BY c.image IS NULL) AS rn FROM cards c
               WHERE c.code IN (${marks}) OR c.code IN (SELECT a.code FROM aliases a WHERE a.alias IN (${marks})))
             WHERE rn = 1 LIMIT ?`,
      args: [...YGO_LEGENDS, ...YGO_LEGENDS, COUNT] as InValue[],
    })
    return rows.map(r => String(r.id))
  }
  // The dearest cards of the kind that carries the game's art: Legends,
  // Pokémon illustrations.
  const kind = game === 'riftbound' ? 'Legend' : 'Pokemon'
  const { rows } = await db.execute({
    sql: `SELECT id FROM (
            SELECT c.id, c.price_eur, ROW_NUMBER() OVER (PARTITION BY c.card_key ORDER BY c.price_eur DESC) AS rn FROM cards c
             WHERE c.category = ? AND c.image IS NOT NULL AND c.price_eur IS NOT NULL AND c.name NOT LIKE '%(%')
           WHERE rn = 1 ORDER BY price_eur DESC LIMIT ?`,
    args: [kind, COUNT],
  })
  return rows.map(r => String(r.id))
}

const showcase = defineCachedFunction(async (game: TcgGameId, lang: 'fr' | 'en'): Promise<ShowcaseArt[]> => {
  const list = await ids(game)
  if (!list.length)
    return []
  const { rows } = await useTcgDb(game).execute(buildByIdQuery(list, lang))
  const cards = new Map(rows.map(r => [String(r.id), toTcgCard(game, r)]))
  return list.flatMap((id) => {
    const c = cards.get(id)
    if (!c || !c.image)
      return []
    return [{ name: c.name, image: c.art ?? c.image, card: !c.art, path: cardPath(game, c.id) }]
  })
}, { maxAge: 60 * 60, name: 'tcg-showcase', getKey: (game: string, lang: string) => `${game}:${lang}` })

export default defineEventHandler(async (event) => {
  const game = tcgGame(event)
  return { arts: await showcase(game, tcgLang(getQuery(event).lang)).catch(() => []) }
})
