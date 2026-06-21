<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useCoach } from '~/composables/useCoach'
import { useLocale } from '~/composables/useLocale'
import { useMarkdown } from '~/composables/useMarkdown'

// Conversational AI deck Coach (backed by the Eve agent service). Lives in the
// deck side column; speaks in chat, grounds every card it names in real data
// (Scryfall/EDHREC) via the agent's tools.

const props = defineProps<{
  /** Compact deck summary sent to the coach as context (commander, identity, list, stats). */
  deckContext: string
  /** Whether the deck has enough to coach on yet. */
  ready: boolean
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useLocale()
const { messages, streaming, error, send, reset, stop } = useCoach()
const { render: renderMarkdown } = useMarkdown()

// The panel lives behind a v-if in the slide-over, so closing it unmounts this
// component — cancel any in-flight stream so it doesn't drain in the background.
onBeforeUnmount(stop)

const input = ref('')
const scroller = ref<HTMLElement | null>(null)

// Starter prompts — the "what can it do" affordance, one tap to ask.
const STARTERS = computed(() => [
  { icon: 'i-lucide-stethoscope', key: 'coach.starterDiagnose' },
  { icon: 'i-lucide-scissors', key: 'coach.starterCut' },
  { icon: 'i-lucide-search', key: 'coach.starterFind' },
  { icon: 'i-lucide-trophy', key: 'coach.starterWin' },
])

async function submit(text?: string) {
  const msg = (text ?? input.value).trim()
  if (!msg || streaming.value)
    return
  input.value = ''
  await send(msg, props.deckContext)
}

// Auto-scroll to the latest message as it streams.
watch(() => messages.value.map(m => m.text).join('|'), async () => {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
})
</script>

<template>
  <div class="glass-solid flex h-full flex-col rounded-[var(--radius-xl)] p-4">
    <!-- Header -->
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[2px] text-(--accent-text)">
        <span class="text-sm leading-none">✦</span>
        {{ t('coach.title') }}
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="messages.length"
          type="button"
          class="font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted) transition-colors hover:text-(--color-text-high)"
          @click="reset"
        >
          {{ t('coach.reset') }}
        </button>
        <button
          type="button"
          class="grid h-7 w-7 place-items-center rounded-full text-(--color-text-muted) transition-colors hover:bg-(--color-surface-2) hover:text-(--color-text-high)"
          :aria-label="t('coach.close')"
          @click="emit('close')"
        >
          <UIcon name="i-lucide-x" class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- Empty state: intro + starter prompts -->
    <div v-if="!messages.length" class="space-y-3">
      <p class="text-sm text-(--color-text-mid)">
        {{ t('coach.intro') }}
      </p>
      <div class="grid grid-cols-1 gap-1.5">
        <button
          v-for="s in STARTERS"
          :key="s.key"
          type="button"
          class="flex items-center gap-2 rounded-[var(--radius-md)] border border-(--color-border-subtle) px-3 py-2 text-left text-sm text-(--color-text-mid) transition-all hover:-translate-y-px hover:border-(--accent-border) hover:bg-(--color-surface-2) hover:text-(--color-text-high) disabled:opacity-50"
          :disabled="!ready"
          @click="submit(t(s.key))"
        >
          <UIcon :name="s.icon" class="h-4 w-4 shrink-0 text-(--accent-text)" />
          {{ t(s.key) }}
        </button>
      </div>
      <p v-if="!ready" class="font-mono text-[10px] text-(--color-text-muted)">
        {{ t('coach.needDeck') }}
      </p>
    </div>

    <!-- Conversation -->
    <div
      v-else
      ref="scroller"
      class="-mr-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2"
    >
      <div
        v-for="(m, i) in messages"
        :key="i"
        class="flex"
        :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[88%] rounded-[var(--radius-lg)] px-3 py-2 text-sm"
          :class="m.role === 'user'
            ? 'accent-soft-bg text-(--color-text-high)'
            : 'bg-(--color-surface-2)/60 text-(--color-text-mid)'"
        >
          <!-- tool-activity chips (assistant only) -->
          <div v-if="m.tools?.length" class="mb-1.5 flex flex-wrap gap-1">
            <span
              v-for="tl in m.tools"
              :key="tl"
              class="inline-flex items-center gap-1 rounded-full bg-(--color-surface-3) px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-(--accent-text)"
            >
              <UIcon name="i-lucide-wand-sparkles" class="h-2.5 w-2.5" />
              {{ tl }}
            </span>
          </div>
          <!-- assistant replies render as sanitized Markdown (tables, lists,
               bold…); user messages stay plain text (never render their input
               as HTML). -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            v-if="m.role === 'assistant' && m.text"
            class="coach-md leading-relaxed"
            v-html="renderMarkdown(m.text)"
          />
          <p v-else-if="m.text" class="whitespace-pre-wrap leading-relaxed">
            {{ m.text }}
          </p>
          <!-- streaming shimmer when the bubble is still empty -->
          <span
            v-if="m.pending && !m.text"
            class="inline-flex gap-1 align-middle"
          >
            <span class="coach-dot" /><span class="coach-dot" /><span class="coach-dot" />
          </span>
        </div>
      </div>
    </div>

    <!-- Error -->
    <p v-if="error" class="mt-2 rounded-[var(--radius-md)] border border-(--color-error)/40 bg-(--color-error)/10 px-3 py-2 text-xs text-(--color-error)">
      {{ error }}
    </p>

    <!-- Composer -->
    <form class="mt-3 flex items-end gap-2" @submit.prevent="submit()">
      <textarea
        v-model="input"
        rows="1"
        :placeholder="t('coach.placeholder')"
        :disabled="!ready || streaming"
        class="max-h-28 min-h-[38px] flex-1 resize-none rounded-[var(--radius-md)] border border-(--color-border-strong) bg-(--color-surface-1) px-3 py-2 text-sm text-(--color-text-high) outline-none transition-colors placeholder:text-(--color-text-muted) focus:border-(--accent-border) disabled:opacity-50"
        @keydown.enter.exact.prevent="submit()"
      />
      <button
        type="submit"
        class="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[var(--radius-md)] bg-primary text-(--color-text-on-neon) transition-transform active:scale-95 disabled:opacity-40"
        :disabled="!ready || streaming || !input.trim()"
        :aria-label="t('coach.send')"
      >
        <UIcon :name="streaming ? 'i-lucide-loader-circle' : 'i-lucide-arrow-up'" class="h-4 w-4" :class="streaming ? 'animate-spin' : ''" />
      </button>
    </form>
    <p class="mt-1.5 font-mono text-[10px] text-(--color-text-muted)">
      {{ t('coach.disclaimer') }}
    </p>
  </div>
</template>

<style scoped>
/* Markdown rendered inside an assistant bubble — compact, chat-sized rhythm. */
.coach-md :deep(p) {
  margin: 0 0 0.5rem;
}
.coach-md :deep(p:last-child) {
  margin-bottom: 0;
}
.coach-md :deep(h1),
.coach-md :deep(h2),
.coach-md :deep(h3),
.coach-md :deep(h4) {
  margin: 0.75rem 0 0.35rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--color-text-high);
}
.coach-md :deep(h1) {
  font-size: 1rem;
}
.coach-md :deep(h2) {
  font-size: 0.95rem;
}
.coach-md :deep(h3),
.coach-md :deep(h4) {
  font-size: 0.875rem;
}
.coach-md :deep(strong) {
  font-weight: 600;
  color: var(--color-text-high);
}
.coach-md :deep(ul),
.coach-md :deep(ol) {
  margin: 0 0 0.5rem;
  padding-left: 1.15rem;
}
.coach-md :deep(li) {
  margin: 0.15rem 0;
}
.coach-md :deep(li::marker) {
  color: var(--color-text-muted);
}
.coach-md :deep(a) {
  color: var(--accent-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.coach-md :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.8em;
  background: var(--color-surface-3);
  border-radius: 4px;
  padding: 1px 4px;
}
.coach-md :deep(pre) {
  margin: 0 0 0.5rem;
  padding: 0.6rem 0.7rem;
  overflow-x: auto;
  background: var(--color-surface-1);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
}
.coach-md :deep(pre code) {
  background: none;
  padding: 0;
}
.coach-md :deep(blockquote) {
  margin: 0 0 0.5rem;
  padding-left: 0.7rem;
  border-left: 2px solid var(--accent-border);
  color: var(--color-text-mid);
}
.coach-md :deep(hr) {
  margin: 0.75rem 0;
  border: 0;
  border-top: 1px solid var(--color-border-subtle);
}
.coach-md :deep(table) {
  width: 100%;
  margin: 0 0 0.5rem;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.coach-md :deep(th),
.coach-md :deep(td) {
  border: 1px solid var(--color-border-subtle);
  padding: 4px 7px;
  text-align: left;
  vertical-align: top;
}
.coach-md :deep(th) {
  background: var(--color-surface-2);
  font-weight: 600;
  color: var(--color-text-high);
}

.coach-dot {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: var(--accent-text);
  animation: coach-bounce 1s ease-in-out infinite;
}
.coach-dot:nth-child(2) {
  animation-delay: 0.15s;
}
.coach-dot:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes coach-bounce {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .coach-dot {
    animation: none;
  }
}
</style>
