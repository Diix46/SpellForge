import process from 'node:process'

// AI deck-assistance — returns structured, actionable suggestions (NOT a chat).
// Body: { action, commander, identity, cards: string[], format? }
// Reply: { add: {name, reason}[], cut: {name, reason}[], note }
//
// Calls Anthropic's Messages API server-side (key from .env). Forces a single
// tool call so the model must return our exact JSON shape.

type Action = 'complete' | 'cut' | 'curve' | 'theme'

interface SuggestBody {
  action?: Action
  commander?: string
  identity?: string[]
  cards?: string[]
  format?: string
}

const MODEL = 'claude-sonnet-4-6'

const ACTION_BRIEF: Record<Action, string> = {
  complete: 'Suggest up to 10 cards to ADD that improve this deck (ramp, draw, removal, synergy, wincons it lacks). Do not suggest cards already in the list.',
  cut: 'Suggest up to 10 cards to CUT — the weakest/most off-theme cards already in the deck — with a short reason each. Only cut cards present in the list.',
  curve: 'Analyse the mana curve and suggest specific ADDs (cheaper interaction/ramp) and CUTs (overcosted redundancies) to smooth it. Be concrete with real card names.',
  theme: 'Identify the deck\'s strongest theme/strategy and suggest up to 10 ADDs that double down on it, plus any clearly off-theme CUTs.',
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

export default defineEventHandler(async (event) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey)
    throw createError({ statusCode: 503, statusMessage: 'AI non configurée (ANTHROPIC_API_KEY absente)' })

  const body = await readBody<SuggestBody>(event).catch(() => null)
  const action: Action = (body?.action && body.action in ACTION_BRIEF) ? body.action : 'complete'
  const commander = (body?.commander || '').trim()
  const identity = Array.isArray(body?.identity) ? body!.identity.join('').toUpperCase() : ''
  const cards = Array.isArray(body?.cards) ? body!.cards.slice(0, 200) : []
  const format = body?.format || 'Commander (EDH)'

  if (!cards.length && !commander)
    throw createError({ statusCode: 400, statusMessage: 'Deck vide' })

  const prompt = [
    `You are a top-tier Magic: The Gathering deckbuilding assistant for the ${format} format.`,
    commander ? `Commander: ${commander} (colour identity: ${identity || 'unknown'}).` : `Colour identity: ${identity || 'unknown'}.`,
    `Current decklist (${cards.length} cards):`,
    cards.map(c => `- ${c}`).join('\n') || '(empty)',
    '',
    ACTION_BRIEF[action],
    'Rules: only suggest cards legal in this format and within the commander colour identity. Use exact English card names. Keep each reason under 15 words. Call the deck_suggestions tool with your answer.',
  ].join('\n')

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
  const result = toolUse?.input ?? { add: [], cut: [], note: '' }
  return { action, ...result }
})
