<script setup lang="ts">
import type { AiAction, AiStats } from '~/composables/useAiSuggest'
import { useAiSuggest } from '~/composables/useAiSuggest'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  commander?: string
  identity?: string[]
  cards: string[]
  /** Computed deck stats fed to the model (it reasons over them, never recounts). */
  stats?: AiStats
  /** Names already in the deck (lowercased) — to show Added state. */
  inDeck: Set<string>
}>()

const emit = defineEmits<{
  add: [name: string]
  remove: [name: string]
}>()

const { t } = useLocale()
const { loading, result, error, run } = useAiSuggest()

const ACTIONS: { key: AiAction, icon: string }[] = [
  { key: 'complete', icon: 'i-lucide-sparkles' },
  { key: 'curve', icon: 'i-lucide-bar-chart-3' },
  { key: 'cut', icon: 'i-lucide-scissors' },
  { key: 'theme', icon: 'i-lucide-wand-sparkles' },
]

function trigger(action: AiAction) {
  run(action, { commander: props.commander, identity: props.identity, cards: props.cards, stats: props.stats })
}
// Total suggestions the server dropped (hallucinated / off-colour / illegal).
const droppedTotal = computed(() => (result.value?.dropped?.add ?? 0) + (result.value?.dropped?.cut ?? 0))
function has(name: string) {
  return props.inDeck.has(name.trim().toLowerCase())
}
</script>

<template>
  <div class="glass-solid rounded-[var(--radius-xl)] p-4">
    <div class="mb-3 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[2px] text-(--accent-text)">
      <UIcon name="i-lucide-bot" class="h-3.5 w-3.5" />
      {{ t('ai.title') }}
    </div>

    <!-- Action chips -->
    <div class="mb-3 flex flex-wrap gap-1.5">
      <button
        v-for="a in ACTIONS"
        :key="a.key"
        type="button"
        class="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all disabled:opacity-50"
        :class="loading === a.key
          ? 'accent-border-c accent-soft-bg text-(--accent-text)'
          : 'border-(--color-border-strong) text-(--color-text-mid) hover:border-(--accent-border) hover:text-(--accent-text)'"
        :disabled="!!loading || cards.length === 0"
        @click="trigger(a.key)"
      >
        <UIcon :name="loading === a.key ? 'i-lucide-loader-circle' : a.icon" class="h-3.5 w-3.5" :class="loading === a.key ? 'animate-spin' : ''" />
        {{ t(`ai.action.${a.key}`) }}
      </button>
    </div>

    <p class="mb-3 font-mono text-[10px] text-(--color-text-muted)">
      {{ t('ai.disclaimer') }}
    </p>

    <p v-if="error" class="rounded-[var(--radius-md)] border border-(--color-error)/40 bg-(--color-error)/10 px-3 py-2 text-xs text-(--color-error)">
      {{ error }}
    </p>

    <!-- Results -->
    <div v-if="result" class="space-y-3">
      <p v-if="result.note" class="text-sm text-(--color-text-mid)">
        {{ result.note }}
      </p>

      <!-- ADD -->
      <div v-if="result.add?.length">
        <div class="mb-1 font-mono text-[10px] uppercase tracking-wider text-(--color-success)">
          {{ t('ai.toAdd') }}
        </div>
        <ul class="space-y-1">
          <li
            v-for="s in result.add"
            :key="s.name"
            class="flex items-start gap-2 rounded-[var(--radius-sm)] bg-(--color-surface-2)/40 px-2 py-1.5"
          >
            <button
              type="button"
              class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-(--color-text-muted) transition-colors hover:text-(--color-success)"
              :title="has(s.name) ? t('ai.inDeck') : t('ai.add')"
              :disabled="has(s.name)"
              @click="emit('add', s.name)"
            >
              <UIcon :name="has(s.name) ? 'i-lucide-check' : 'i-lucide-plus'" class="h-3.5 w-3.5" />
            </button>
            <div class="min-w-0">
              <div class="text-sm text-(--color-text-high)">
                {{ s.name }}
              </div>
              <div class="text-[11px] text-(--color-text-muted)">
                {{ s.reason }}
              </div>
            </div>
          </li>
        </ul>
      </div>

      <!-- CUT -->
      <div v-if="result.cut?.length">
        <div class="mb-1 font-mono text-[10px] uppercase tracking-wider text-(--color-error)">
          {{ t('ai.toCut') }}
        </div>
        <ul class="space-y-1">
          <li
            v-for="s in result.cut"
            :key="s.name"
            class="flex items-start gap-2 rounded-[var(--radius-sm)] bg-(--color-surface-2)/40 px-2 py-1.5"
          >
            <button
              type="button"
              class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-(--color-text-muted) transition-colors hover:text-(--color-error)"
              :title="t('ai.remove')"
              @click="emit('remove', s.name)"
            >
              <UIcon name="i-lucide-minus" class="h-3.5 w-3.5" />
            </button>
            <div class="min-w-0">
              <div class="text-sm text-(--color-text-high)">
                {{ s.name }}
              </div>
              <div class="text-[11px] text-(--color-text-muted)">
                {{ s.reason }}
              </div>
            </div>
          </li>
        </ul>
      </div>

      <!-- Honesty footer: suggestions the server dropped (off-colour / illegal /
           not a real card, or a cut not in the deck) never reach the lists above. -->
      <p
        v-if="droppedTotal > 0"
        class="flex items-center gap-1.5 border-t border-(--color-border-subtle) pt-2 font-mono text-[10px] text-(--color-text-muted)"
      >
        <UIcon name="i-lucide-shield-check" class="h-3 w-3 text-(--accent-text)" />
        {{ t('ai.dropped').replace('{n}', String(droppedTotal)) }}
      </p>
    </div>
  </div>
</template>
