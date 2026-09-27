/**
 * The landing's worlds: for each game, how many cards it has, three of its
 * most sought-after cards to fan out in the gallery, and a dozen more for its
 * column in the hero. Card databases only; one
 * hour of cache (they move with the nightly refresh). A database still being
 * built leaves its world at zero, not the page broken.
 */
import type { GameId } from '../../../shared/game'
import type { LandingWorld } from '../../../shared/landing'
import type { TcgGameId } from '../../../shared/tcg/types'
import { cardPath, GAME_IDS } from '../../../shared/game'
import { isTcgGame } from '../../../shared/tcg/types'
import { useMtgCardsDb, useOptcgCardsDb } from '../../utils/cards/db'
import { imageUrl } from '../../utils/cards/mtg-shape'
import { optcgImageUrl } from '../../utils/cards/optcg-shape'
import { useTcgDb } from '../../utils/tcg/db'
import { tcgImageUrl } from '../../utils/tcg/query'

const FAN = 3
const STRIP = 12

async function mtg(lang: 'fr' | 'en'): Promise<LandingWorld> {
  const db = useMtgCardsDb()
  const [{ rows: [n] }, { rows }, { rows: strip }] = await Promise.all([
    db.execute('SELECT COUNT(*) AS n FROM oracle_cards WHERE legal_commander = 1 AND is_funny = 0'),
    // Famous commanders: the most played legendary creatures with a real scan.
    db.execute({
      sql: `SELECT o.name, p.id, p.img_version, p.printed_name FROM oracle_cards o
              JOIN printings p ON p.oracle_id = o.oracle_id AND p.lang = ? AND p.is_real_image = 1 AND p.img_version IS NOT NULL
             WHERE o.name IN ('Atraxa, Praetors'' Voice', 'The Ur-Dragon', 'Edgar Markov')
             GROUP BY o.name`,
      args: [lang],
    }),
    // The most played commanders, their latest real printing.
    db.execute({
      sql: `SELECT * FROM (
              SELECT o.name, o.edhrec_sort, p.id, p.img_version, p.printed_name,
                     ROW_NUMBER() OVER (PARTITION BY o.oracle_id ORDER BY p.released_at DESC) AS rn
                FROM oracle_cards o
                JOIN printings p ON p.oracle_id = o.oracle_id AND p.lang = ? AND p.is_real_image = 1 AND p.img_version IS NOT NULL
                                AND p.is_paper = 1 AND p.is_ub = 0
               WHERE o.legal_commander = 1 AND o.type_line LIKE 'Legendary Creature%' AND o.edhrec_sort IS NOT NULL)
             WHERE rn = 1 ORDER BY edhrec_sort LIMIT ?`,
      args: [lang, STRIP],
    }),
  ])
  const shape = (r: Record<string, unknown>) => ({ name: String(r.printed_name ?? r.name), image: imageUrl('normal', 'front', String(r.id), r.img_version as string | null, 'thumb'), path: cardPath('mtg', String(r.name)) })
  return {
    game: 'mtg',
    cards: Number(n?.n ?? 0),
    fan: rows.slice(0, FAN).map(shape),
    strip: strip.map(shape),
  }
}

async function optcg(lang: 'fr' | 'en'): Promise<LandingWorld> {
  const db = useOptcgCardsDb()
  const [{ rows: [n] }, { rows }, { rows: strip }] = await Promise.all([
    db.execute('SELECT COUNT(*) AS n FROM op_numbers'),
    db.execute({
      sql: `SELECT c.id, c.lang, c.name, c.img_version, n.card_number FROM op_numbers n
              JOIN op_best b ON b.card_number = n.card_number AND b.lang = ?
              JOIN op_cards c ON c.id = b.id AND c.lang = b.row_lang
             WHERE n.card_number IN ('OP01-001', 'OP05-119', 'OP09-001')`,
      args: [lang],
    }),
    // The latest Leaders.
    db.execute({
      sql: `SELECT c.id, c.lang, c.name, c.img_version, n.card_number FROM op_numbers n
              JOIN op_best b ON b.card_number = n.card_number AND b.lang = ?
              JOIN op_cards c ON c.id = b.id AND c.lang = b.row_lang
             WHERE n.category = 'Leader' AND n.card_number LIKE 'OP%'
             ORDER BY n.card_number DESC LIMIT ?`,
      args: [lang, STRIP],
    }),
  ])
  const shape = (r: Record<string, unknown>) => ({ name: String(r.name), image: optcgImageUrl(String(r.lang), String(r.id), r.img_version as string | null, 'thumb'), path: cardPath('optcg', String(r.card_number)) })
  return {
    game: 'optcg',
    cards: Number(n?.n ?? 0),
    fan: rows.slice(0, FAN).map(shape),
    strip: strip.map(shape),
  }
}

async function tcg(game: TcgGameId, lang: 'fr' | 'en'): Promise<LandingWorld> {
  const db = useTcgDb(game)
  const [{ rows: [n] }, { rows }] = await Promise.all([
    db.execute('SELECT COUNT(DISTINCT card_key) AS n FROM cards'),
    // Its dearest cards, one printing each (no variant), in the site language when printed so.
    db.execute({
      sql: `SELECT id, name, image, thumb FROM (
              SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.card_key ORDER BY (c.lang = ?) DESC, c.price_eur DESC) AS rn
                FROM cards c WHERE c.image IS NOT NULL AND c.price_eur IS NOT NULL AND c.category NOT IN ('Rune', 'Battlefield', 'Energy')
                 AND c.name NOT LIKE '%(%')
             WHERE rn = 1 ORDER BY price_eur DESC LIMIT ?`,
      args: [lang, FAN + STRIP],
    }),
  ])
  const cards = rows.map((r) => {
    const image = tcgImageUrl(game, r.image) ?? ''
    const thumb = r.thumb && r.thumb !== r.image ? tcgImageUrl(game, r.thumb) ?? image : `${image}?size=thumb`
    return { name: String(r.name), image: thumb, path: cardPath(game, String(r.id)) }
  })
  return { game, cards: Number(n?.n ?? 0), fan: cards.slice(0, FAN), strip: cards.slice(FAN) }
}

const worlds = defineCachedFunction(async (lang: 'fr' | 'en'): Promise<LandingWorld[]> => {
  const one = (g: GameId) => (isTcgGame(g) ? tcg(g, lang) : g === 'mtg' ? mtg(lang) : optcg(lang))
    .catch(() => ({ game: g, cards: 0, fan: [], strip: [] }))
  return Promise.all(GAME_IDS.map(one))
}, { maxAge: 60 * 60, name: 'landing-worlds-2', getKey: (lang: string) => lang })

export default defineEventHandler(async event => ({ worlds: await worlds(getQuery(event).lang === 'en' ? 'en' : 'fr') }))
