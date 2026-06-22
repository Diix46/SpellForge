import process from 'node:process'

// AI deck-assistance — returns structured, actionable suggestions (NOT a chat).
//
// The model REASONS over the deck's real, computed data (curve, types, colours,
// price, role counts, EDHREC ground-truth names) — it does not recall stats. Any
// card name it returns is then VALIDATED server-side before reaching the client:
//   - adds must resolve to a real Scryfall card, be within the commander's colour
//     identity, and be legal in Commander;
//   - cuts must already be in the submitted decklist.
// Anything that fails is dropped and counted, so the UI never shows a card the
// player can't actually add (no more "Carte introuvable" from AI).

type Action = 'complete' | 'cut' | 'curve' | 'theme'

interface DeckStats {
  cardCount?: number
  avgCmc?: number
  curve?: number[] // buckets 0..6 then 7+
  types?: Record<string, number> // e.g. { creature: 30, land: 37, ... }
  colors?: Record<string, number> // WUBRG + c counts
  priceTotal?: number
  roles?: Record<string, number> // ramp/draw/removal/wipes/... (computed client-side)
}

interface SuggestBody {
  action?: Action
  commander?: string
  identity?: string[]
  cards?: string[]
  format?: string
  stats?: DeckStats
  edhrec?: string[] // EDHREC top/synergy names (community ground truth)
}

const MODEL = 'claude-sonnet-4-6'

const ACTION_BRIEF: Record<Action, string> = {
  complete: 'Suggest up to 10 cards to ADD that improve this deck (fill the weakest roles: ramp, draw, removal, interaction, synergy, or a missing wincon). Do not suggest cards already in the list.',
  cut: 'Suggest up to 10 cards to CUT — the weakest / most off-plan cards ALREADY in the deck — each with a short plan-relative reason. Only cut cards present in the list.',
  curve: 'The mana curve is provided. Suggest concrete ADDs (cheaper interaction/ramp where the low end is thin) and CUTs (overcosted redundancies where the top is heavy) to smooth it. Use real card names.',
  theme: 'Identify the deck\'s strongest theme/strategy from its cards and stats, and suggest up to 10 ADDs that double down on it, plus any clearly off-theme CUTs.',
}

const TOOL = {
  name: 'deck_suggestions',
  description: 'Return structured Magic: The Gathering deck suggestions.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['add', 'cut', 'note'],
    properties: {
      add: {
        type: 'array',
        items: { type: 'object', required: ['name', 'reason'], additionalProperties: false, properties: { name: { type: 'string' }, reason: { type: 'string' } } },
      },
      cut: {
        type: 'array',
        items: { type: 'object', required: ['name', 'reason'], additionalProperties: false, properties: { name: { type: 'string' }, reason: { type: 'string' } } },
      },
      note: { type: 'string', description: 'One-sentence overall summary.' },
    },
  },
}

// ---- Prompt construction ----------------------------------------------------

function statsBlock(stats?: DeckStats): string {
  if (!stats)
    return ''
  const lines: string[] = ['Deck stats (computed — trust these, do not recount):']
  if (stats.cardCount != null)
    lines.push(`- Cards: ${stats.cardCount}`)
  if (stats.avgCmc != null)
    lines.push(`- Average CMC: ${stats.avgCmc.toFixed(2)}`)
  if (stats.curve?.length)
    lines.push(`- Mana curve (CMC 0,1,2,3,4,5,6,7+): ${stats.curve.join(', ')}`)
  if (stats.types && Object.keys(stats.types).length)
    lines.push(`- Types: ${Object.entries(stats.types).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  if (stats.colors && Object.keys(stats.colors).length)
    lines.push(`- Colour spread: ${Object.entries(stats.colors).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(', ')}`)
  if (stats.roles && Object.keys(stats.roles).length)
    lines.push(`- Role counts: ${Object.entries(stats.roles).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  if (stats.priceTotal != null)
    lines.push(`- Total price: ${stats.priceTotal.toFixed(2)} EUR`)
  return lines.join('\n')
}

function buildPrompt(body: SuggestBody, action: Action): string {
  const commander = (body.commander || '').trim()
  const identity = Array.isArray(body.identity) ? body.identity.join('').toUpperCase() : ''
  const cards = Array.isArray(body.cards) ? body.cards.slice(0, 200) : []
  const format = body.format || 'Commander (EDH)'
  const edhrec = Array.isArray(body.edhrec) ? body.edhrec.slice(0, 40) : []

  return [
    `You are a top-tier Magic: The Gathering deckbuilding assistant for the ${format} format.`,
    commander ? `Commander: ${commander} (colour identity: ${identity || 'unknown'}).` : `Colour identity: ${identity || 'unknown'}.`,
    statsBlock(body.stats),
    edhrec.length ? `Cards commonly played with this commander (EDHREC, real names — prefer these for ADDs): ${edhrec.join(', ')}.` : '',
    `Current decklist (${cards.length} cards):`,
    cards.map(c => `- ${c}`).join('\n') || '(empty)',
    '',
    ACTION_BRIEF[action],
    'Rules: only suggest cards legal in this format and strictly within the commander colour identity. Use exact English card names. Keep each reason under 15 words and tie it to THIS deck\'s plan. Call the deck_suggestions tool with your answer.',
  ].filter(Boolean).join('\n')
}

// The validation gate (resolve + identity + legality + dedupe) lives in
// server/utils/suggestValidate.ts — filterValidCuts / validateAdds.

export default defineEventHandler(async (event) => {
  await requireAppUser(event)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey)
    throw createError({ statusCode: 503, statusMessage: 'AI non configurée (ANTHROPIC_API_KEY absente)' })

  const body = await readBody<SuggestBody>(event).catch(() => null)
  const action: Action = (body?.action && body.action in ACTION_BRIEF) ? body.action : 'complete'
  const commander = (body?.commander || '').trim()
  const identity = Array.isArray(body?.identity) ? body!.identity : []
  const cards = Array.isArray(body?.cards) ? body!.cards.slice(0, 200) : []

  if (!cards.length && !commander)
    throw createError({ statusCode: 400, statusMessage: 'Deck vide' })

  const prompt = buildPrompt(body ?? {}, action)

  let data: any
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'deck_suggestions' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw createError({ statusCode: 502, statusMessage: `Anthropic ${res.status}: ${txt.slice(0, 200)}` })
    }
    data = await res.json()
  }
  catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err)
      throw err
    throw createError({ statusCode: 502, statusMessage: 'Appel IA échoué' })
  }

  const toolUse = (data.content ?? []).find((c: any) => c.type === 'tool_use')
  const raw = toolUse?.input ?? { add: [], cut: [], note: '' }
  const rawAdd: Suggestion[] = Array.isArray(raw.add) ? raw.add : []
  const rawCut: Suggestion[] = Array.isArray(raw.cut) ? raw.cut : []

  // ---- Validation gate: cuts must be in the deck; adds must resolve, be
  //      in-identity, Commander-legal, not already present, and unique. ----
  const inDeck = new Set(cards.map(c => c.trim().toLowerCase()))
  const allowed = new Set(identity.map(c => c.toLowerCase()))
  const { cut, dropped: cutDropped } = filterValidCuts(rawCut, inDeck)
  const { add, dropped: addDropped } = await validateAdds(rawAdd, allowed, inDeck)

  return {
    action,
    add,
    cut,
    note: typeof raw.note === 'string' ? raw.note : '',
    dropped: { add: addDropped, cut: cutDropped },
  }
})
