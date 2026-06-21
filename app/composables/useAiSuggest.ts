import { ref } from 'vue'

export type AiAction = 'complete' | 'cut' | 'curve' | 'theme'
export interface AiSuggestion { name: string, reason: string }
export interface AiResult {
  action: AiAction
  add: AiSuggestion[]
  cut: AiSuggestion[]
  note: string
  /**
   * How many model suggestions the server dropped (hallucinated / off-colour /
   * illegal adds, or cuts not in the deck) — surfaced to the user for honesty.
   */
  dropped?: { add: number, cut: number }
}

/** Structured, already-computed deck context the model reasons over (never recalls). */
export interface AiStats {
  cardCount?: number
  avgCmc?: number
  curve?: number[]
  types?: Record<string, number>
  colors?: Record<string, number>
  priceTotal?: number
  roles?: Record<string, number>
}

export interface AiContext {
  commander?: string
  identity?: string[]
  cards: string[]
  stats?: AiStats
  edhrec?: string[]
}

export function useAiSuggest() {
  const loading = ref<AiAction | null>(null)
  const result = ref<AiResult | null>(null)
  const error = ref('')

  async function run(action: AiAction, ctx: AiContext) {
    loading.value = action
    error.value = ''
    try {
      result.value = await $fetch<AiResult>('/api/ai/suggest', {
        method: 'POST',
        body: {
          action,
          commander: ctx.commander,
          identity: ctx.identity,
          cards: ctx.cards,
          stats: ctx.stats,
          edhrec: ctx.edhrec,
        },
      })
    }
    catch (e: any) {
      error.value = e?.data?.statusMessage || e?.statusMessage || e?.message || 'erreur'
      result.value = null
    }
    finally {
      loading.value = null
    }
  }

  function clear() {
    result.value = null
    error.value = ''
  }

  return { loading, result, error, run, clear }
}
