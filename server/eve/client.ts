import process from 'node:process'
import Anthropic from '@anthropic-ai/sdk'

// Shared Anthropic client for the Eve agent service. Lazily constructed so a
// missing key only fails when the coach is actually used (not at boot), and
// reused across requests so we don't spin up a client per call.

export const MODEL = 'claude-sonnet-4-6'

let client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (client)
    return client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey)
    throw createError({ statusCode: 503, statusMessage: 'Coach IA non configuré (clé API manquante)' })
  client = new Anthropic({ apiKey })
  return client
}
