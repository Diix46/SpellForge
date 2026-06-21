import { createAnthropic } from '@ai-sdk/anthropic'
import { defineAgent } from 'eve'

// Direct Anthropic provider (reads ANTHROPIC_API_KEY) — no Vercel AI Gateway, so
// this PoC runs fully self-hosted/local, matching the main app's setup.
// NOTE: the beta ai@7 + @ai-sdk/anthropic stack Eve pins POSTs to
// api.anthropic.com/messages (missing /v1) on the streaming path → 404. Pin the
// baseURL explicitly with the /v1 prefix to work around that beta bug.
const anthropic = createAnthropic({
  baseURL: 'https://api.anthropic.com/v1',
})

export default defineAgent({
  model: anthropic('claude-sonnet-4-6'),
})
