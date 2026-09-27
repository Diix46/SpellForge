import { GAMES } from '../../../shared/game'
/**
 * A card photographed, read: its printed name (and English name when known),
 * its set code and collector number, as the collection's add dialog needs to
 * find it. Claude reads the picture (the coach's key); nothing is kept.
 *
 * Members only, a few dozen scans an hour each: every scan is a paid call.
 */
import { getAnthropic } from '../../eve/client'
import { requireAppUser } from '../../utils/appUser'
import { gameOf } from '../../utils/collection/copies'

const MODEL = 'claude-sonnet-5'
const PER_HOUR = 40
const MAX_BYTES = 2_500_000
const recent = new Map<string, number[]>()

const HINTS: Record<string, string> = {
  mtg: 'Magic: The Gathering. The set code is the 3–5 letter code at the bottom left (e.g. "FDN"), the collector number next to it (e.g. "0204" → "204"). Give the English card name too if you know it.',
  optcg: 'One Piece Card Game. The card number is printed at the bottom right, like "OP01-001" or "ST10-005": give it as "number", and its prefix before the dash (e.g. "OP01") as "set".',
  pokemon: 'Pokémon TCG. The collector number is at the bottom (e.g. "006/165" → "006"); the set is the small set symbol/code there when readable (e.g. "MEW", "OBF", "sv03.5").',
  yugioh: 'Yu-Gi-Oh!. The set code is printed under the artwork on the right, like "LOB-EN001" or "MAMS-FR012": give the part before the dash as "set" and the full code as "number".',
  riftbound: 'Riftbound (League of Legends TCG). The set and number are at the bottom left, like "OGN • 001/298": give "OGN" as "set" and "001" as "number".',
}

export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const body = await readBody<{ game?: string, image?: string }>(event)
  const game = gameOf(body?.game)
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body?.image ?? '')
  if (!m || m[2]!.length * 0.75 > MAX_BYTES)
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Image illisible ou trop lourde' })

  const now = Date.now()
  const mine = (recent.get(user.id) ?? []).filter(t => now - t < 3_600_000)
  if (mine.length >= PER_HOUR)
    throw createError({ statusCode: 429, statusMessage: 'Too Many Requests', message: 'Trop de scans pour l\'instant, réessaie dans un moment.' })
  recent.set(user.id, [...mine, now])

  const res = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: `You read trading cards from photos for a collection app. The game is ${GAMES[game].label}. ${HINTS[game] ?? ''}
Answer with one JSON object only: {"found": true|false, "name": "name as printed", "nameEn": "English name or null", "set": "set code or null", "number": "collector number or null", "lang": "fr|en|other|null"}. "found" is false when no card of this game is clearly visible.`,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: m[1] as 'image/jpeg' | 'image/png' | 'image/webp', data: m[2]! } },
      { type: 'text', text: 'Which card is this?' },
    ] }],
  })
  const text = res.content.filter(p => p.type === 'text').map(p => ('text' in p ? p.text : '')).join('')
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  let read: { found?: boolean, name?: string | null, nameEn?: string | null, set?: string | null, number?: string | null, lang?: string | null } = {}
  try {
    read = JSON.parse(json)
  }
  catch {}
  if (!read.found || !read.name)
    return { found: false as const }
  const clean = (v: unknown) => (typeof v === 'string' && v.trim() && v !== 'null' ? v.trim().slice(0, 80) : null)
  return {
    found: true as const,
    name: clean(read.name)!,
    nameEn: clean(read.nameEn),
    set: clean(read.set),
    number: clean(read.number),
    lang: read.lang === 'fr' || read.lang === 'en' ? read.lang : null,
  }
})
