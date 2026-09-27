/**
 * A game's signature illustrations, for its page backdrop and its 3D room:
 * Yu-Gi-Oh's legendary monsters (their art alone), Riftbound's Legends and
 * Pokémon's mascots — Pikachu, Mew, Eevee… (their whole card; the client
 * crops the art).
 * And its emblems, for medallions: Riftbound's rune cards, Pokémon's basic
 * Energy (their symbol fills the card's middle).
 * One hour of cache: they move with the nightly refresh, rarely.
 */
import type { InValue } from '@libsql/client'
import type { TcgGameId } from '../../../../shared/tcg/types'
import { cardPath } from '../../../../shared/game'
import { useTcgDb } from '../../../utils/tcg/db'
import { ARCANE_MURALS, lolSplash } from '../../../utils/tcg/lol'
import { tcgGame, tcgLang } from '../../../utils/tcg/params'
import { buildByIdQuery, toTcgCard } from '../../../utils/tcg/query'

export interface ShowcaseArt {
  name: string
  /** The illustration: its own image, or the whole card when there is none. */
  image: string
  /** True when `image` is the whole card, the art to be cropped from it. */
  card: boolean
  /** A light copy of `image`, for small frames. */
  thumb: string
  /** Riftbound: the Legend's champion in League of Legends' own splash art (sharp, landscape). */
  splash?: string | null
  path: string
}

const COUNT = 8
const POKEMON_MASCOTS = ['pikachu', 'mew', 'eevee', 'charizard', 'bulbasaur', 'squirtle', 'gengar', 'snorlax', 'jigglypuff', 'psyduck', 'lucario', 'mimikyu'] as const
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
  // Pokémon's mascots, the first ones the games made famous: each in its
  // illustration rare when it has one (the art fills the card), else its
  // newest printing.
  if (game === 'pokemon') {
    const marks = POKEMON_MASCOTS.map(() => '?').join(',')
    const { rows } = await db.execute({
      sql: `SELECT id, card_key FROM (
              SELECT c.id, c.card_key, ROW_NUMBER() OVER (PARTITION BY c.card_key
                       ORDER BY c.rarity LIKE '%llustration%' DESC, s.released DESC) AS rn
                FROM cards c LEFT JOIN sets s ON s.code = c.set_code AND s.lang = c.lang
               WHERE c.card_key IN (${marks}) AND c.image IS NOT NULL AND c.lang = 'en')
             WHERE rn = 1`,
      args: POKEMON_MASCOTS as unknown as InValue[],
    })
    // In the list's order: Pikachu first.
    const rank = (key: unknown) => (POKEMON_MASCOTS as readonly string[]).indexOf(String(key))
    return [...rows].sort((a, b) => rank(a.card_key) - rank(b.card_key)).map(r => String(r.id))
  }
  // The dearest Legends: the champions whose art the game shows most.
  const kind = 'Legend'
  const { rows } = await db.execute({
    sql: `SELECT id FROM (
            SELECT c.id, c.price_eur, ROW_NUMBER() OVER (PARTITION BY c.card_key ORDER BY c.price_eur DESC) AS rn FROM cards c
             WHERE c.category = ? AND c.image IS NOT NULL AND c.price_eur IS NOT NULL AND c.name NOT LIKE '%(%')
           WHERE rn = 1 ORDER BY price_eur DESC LIMIT ?`,
    args: [kind, COUNT],
  })
  return rows.map(r => String(r.id))
}

/** One card per emblem: each Rune, each basic Energy; newest printing with a scan. */
async function emblemIds(game: TcgGameId): Promise<string[]> {
  const where = game === 'riftbound'
    ? `c.category = 'Rune'`
    : game === 'pokemon' ? `c.category = 'Energy' AND c.subtype IN ('Normal', 'Basic')` : null
  if (!where)
    return []
  const { rows } = await useTcgDb(game).execute({
    sql: `SELECT id FROM (
            SELECT c.id, ROW_NUMBER() OVER (PARTITION BY c.card_key ORDER BY s.released DESC) AS rn
              FROM cards c LEFT JOIN sets s ON s.code = c.set_code AND s.lang = c.lang
             WHERE ${where} AND c.image IS NOT NULL AND c.name NOT LIKE '%(%')
           WHERE rn = 1 LIMIT 9`,
    args: [],
  })
  return rows.map(r => String(r.id))
}

async function cardsOf(game: TcgGameId, list: string[], lang: 'fr' | 'en'): Promise<ShowcaseArt[]> {
  if (!list.length)
    return []
  const { rows } = await useTcgDb(game).execute(buildByIdQuery(list, lang))
  const cards = new Map(rows.map(r => [String(r.id), toTcgCard(game, r)]))
  return list.flatMap((id) => {
    const c = cards.get(id)
    if (!c || !c.image)
      return []
    const image = c.art ?? c.image
    return [{ name: c.name, image, thumb: c.art ? image : c.thumb || image, card: !c.art, path: cardPath(game, c.id), champion: c.tags[0] ?? null }]
  })
}

const showcase = defineCachedFunction(async (game: TcgGameId, lang: 'fr' | 'en'): Promise<{ arts: ShowcaseArt[], emblems: ShowcaseArt[], murals: string[] }> => {
  const [arts, emblems] = await Promise.all([ids(game), emblemIds(game)])
  const cards = await cardsOf(game, arts, lang)
  // Riftbound's Legends are League's champions: their own splash art.
  if (game === 'riftbound') {
    await Promise.all(cards.map(async (c) => {
      c.splash = await lolSplash((c as ShowcaseArt & { champion?: string | null }).champion)
    }))
  }
  return { arts: cards.map(({ champion: _, ...c }: ShowcaseArt & { champion?: string | null }) => c), emblems: await cardsOf(game, emblems, lang), murals: game === 'riftbound' ? ARCANE_MURALS : [] }
}, { maxAge: 60 * 60, name: 'tcg-showcase-6', getKey: (game: string, lang: string) => `${game}:${lang}` })

export default defineEventHandler(async (event) => {
  const game = tcgGame(event)
  return showcase(game, tcgLang(getQuery(event).lang)).catch(() => ({ arts: [], emblems: [], murals: [] }))
})
