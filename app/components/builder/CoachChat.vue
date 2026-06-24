<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useCardPreview } from '~/composables/useCardPreview'
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
  /** Current deck id + name, used to label/bind a new conversation in history. */
  deckId?: string
  deckName?: string
}>()
const emit = defineEmits<{ close: [] }>()

const { t, locale } = useLocale()
const {
  messages,
  streaming,
  error,
  expanded,
  conversations,
  activeId,
  send,
  newConversation,
  loadConversation,
  deleteConversation,
  stop,
} = useCoach()
const { render: renderMarkdown } = useMarkdown()

// History dropdown open-state.
const historyOpen = ref(false)
function openConversation(id: string) {
  loadConversation(id)
  historyOpen.value = false
}
function startNew() {
  newConversation()
  historyOpen.value = false
}

// The panel lives behind a v-if in the slide-over, so closing it unmounts this
// component — cancel any in-flight stream so it doesn't drain in the background.
onBeforeUnmount(stop)

const input = ref('')
const scroller = ref<HTMLElement | null>(null)

// ── Hoverable cards ──────────────────────────────────────────────────────────
// The Coach tags every card it names as [[Name]]; useMarkdown turns those into
// <span class="coach-card" data-card="Name">. On hover we resolve the card's
// image (site language) and show the shared big floating preview. Resolved URLs
// are cached so re-hovering the same card is instant; in-flight names are tracked
// so a quick hover-out doesn't strand a stale preview.
const { preview, show: showPreviewSrc, hide: hidePreview } = useCardPreview()
const imageCache = new Map<string, string | null>()
let hoverToken = 0

async function resolveCardImage(name: string): Promise<string | null> {
  const key = `${locale.value}:${name.toLowerCase()}`
  if (imageCache.has(key))
    return imageCache.get(key) ?? null
  try {
    const res = await $fetch<{ image: string | null }>('/api/cards/card-image', {
      params: { name, lang: locale.value },
    })
    imageCache.set(key, res.image)
    return res.image
  }
  catch {
    imageCache.set(key, null)
    return null
  }
}

async function onCardEnter(e: MouseEvent) {
  const el = (e.target as HTMLElement)?.closest('.coach-card') as HTMLElement | null
  if (!el)
    return
  const name = el.dataset.card
  if (!name)
    return
  const token = ++hoverToken
  const img = await resolveCardImage(name)
  // Bail if the pointer already moved on to something else.
  if (token !== hoverToken || !img)
    return
  showPreviewSrc(img, { currentTarget: el } as unknown as MouseEvent)
}

function onCardLeave(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('.coach-card')) {
    hoverToken++ // cancel any pending resolve
    hidePreview()
  }
}

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
  await send(msg, props.deckContext, { id: props.deckId ?? '', name: props.deckName ?? '' })
}

// Auto-scroll to the latest message as it streams. Deep-watch the messages
// array (its elements' text mutates in place during streaming) rather than
// re-joining every message into a string on each reactive tick.
watch(messages, async () => {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
}, { deep: true })
</script>

<template>
  <div class="glass-solid flex h-full flex-col rounded-[var(--radius-xl)] p-4">
    <!-- Header -->
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[2px] text-(--accent-text)">
        <span class="text-sm leading-none">✦</span>
        {{ t('coach.title') }}
      </div>
      <div class="flex items-center gap-1">
        <!-- History (all decks) -->
        <div class="relative">
          <button
            type="button"
            class="grid h-7 w-7 place-items-center rounded-full text-(--color-text-muted) transition-colors hover:bg-(--color-surface-2) hover:text-(--color-text-high)"
            :class="{ 'text-(--accent-text)': historyOpen }"
            :aria-label="t('coach.history')"
            :title="t('coach.history')"
            @click="historyOpen = !historyOpen"
          >
            <UIcon name="i-lucide-history" class="h-4 w-4" />
          </button>
          <!-- Dropdown -->
          <div
            v-if="historyOpen"
            class="glass-solid absolute right-0 top-9 z-10 max-h-80 w-72 overflow-y-auto rounded-[var(--radius-lg)] border border-(--color-border-subtle) p-1.5 shadow-[var(--shadow-elev-3)]"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-sm text-(--accent-text) transition-colors hover:bg-(--color-surface-2)"
              @click="startNew"
            >
              <UIcon name="i-lucide-plus" class="h-4 w-4 shrink-0" />
              {{ t('coach.newConversation') }}
            </button>
            <p v-if="!conversations.length" class="px-2.5 py-2 text-xs text-(--color-text-muted)">
              {{ t('coach.historyEmpty') }}
            </p>
            <button
              v-for="c in conversations"
              :key="c.id"
              type="button"
              class="group flex w-full items-start gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors hover:bg-(--color-surface-2)"
              :class="c.id === activeId ? 'bg-(--color-surface-2)' : ''"
              @click="openConversation(c.id)"
            >
              <UIcon name="i-lucide-message-square" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--color-text-muted)" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-(--color-text-high)">{{ c.title }}</span>
                <span class="block truncate font-mono text-[10px] text-(--color-text-muted)">
                  {{ c.deckName || t('coach.noDeck') }}
                </span>
              </span>
              <UIcon
                name="i-lucide-trash-2"
                class="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--color-text-muted) opacity-0 transition-opacity hover:text-(--color-error) group-hover:opacity-100"
                role="button"
                :aria-label="t('coach.deleteConversation')"
                @click.stop="deleteConversation(c.id)"
              />
            </button>
          </div>
        </div>
        <!-- New conversation (quick) -->
        <button
          v-if="messages.length"
          type="button"
          class="grid h-7 w-7 place-items-center rounded-full text-(--color-text-muted) transition-colors hover:bg-(--color-surface-2) hover:text-(--color-text-high)"
          :aria-label="t('coach.newConversation')"
          :title="t('coach.newConversation')"
          @click="startNew"
        >
          <UIcon name="i-lucide-plus" class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="grid h-7 w-7 place-items-center rounded-full text-(--color-text-muted) transition-colors hover:bg-(--color-surface-2) hover:text-(--color-text-high)"
          :aria-label="expanded ? t('coach.shrink') : t('coach.expand')"
          :title="expanded ? t('coach.shrink') : t('coach.expand')"
          @click="expanded = !expanded"
        >
          <UIcon :name="expanded ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="grid h-7 w-7 place-items-center rounded-full text-(--color-text-muted) transition-colors hover:bg-(--color-surface-2) hover:text-(--color-text-high)"
          :aria-label="t('coach.minimize')"
          :title="t('coach.minimize')"
          @click="emit('close')"
        >
          <UIcon name="i-lucide-chevron-down" class="h-4 w-4" />
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
          :aria-label="ready ? t(s.key) : `${t(s.key)} — ${t('coach.needDeck')}`"
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
      aria-live="polite"
      class="-mr-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2"
      @mouseover="onCardEnter"
      @mouseout="onCardLeave"
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
          <!-- transient activity line while tools/specialists run -->
          <div
            v-if="m.pending && m.statusLine"
            class="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-(--accent-text)"
          >
            <span class="inline-flex gap-1 align-middle">
              <span class="coach-dot" /><span class="coach-dot" /><span class="coach-dot" />
            </span>
            {{ m.statusLine }}
          </div>
          <!-- streaming shimmer when the bubble is still empty and idle -->
          <span
            v-else-if="m.pending && !m.text"
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

    <!-- Big floating card preview for hovered [[cards]] in the Coach replies
         (teleported to body so the chat panel can't clip it). -->
    <Teleport to="body">
      <Transition name="cardpop">
        <img
          v-if="preview"
          :src="preview.src"
          alt=""
          class="card-preview pointer-events-none fixed z-[var(--z-tooltip)] rounded-[var(--radius-xl)] ring-1 ring-(--accent-border)"
          :style="{ left: `${preview.x}px`, top: `${preview.y}px`, width: `${preview.w}px`, height: `${preview.h}px` }"
        >
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* Cards the Coach names ([[Name]] → .coach-card): underlined accent token that
   reveals the big card preview on hover. */
.coach-md :deep(.coach-card) {
  color: var(--accent-text);
  font-weight: 600;
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
  transition: color var(--dur-fast) var(--ease-out);
}
.coach-md :deep(.coach-card:hover) {
  color: var(--color-text-high);
  text-decoration-style: solid;
}

/* card preview pop (mirror the deck-list rows' transition) */
.cardpop-enter-active {
  transition:
    opacity var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-spring);
}
.cardpop-leave-active {
  transition: opacity var(--dur-fast) var(--ease-in);
}
.cardpop-enter-from,
.cardpop-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
@media (prefers-reduced-motion: reduce) {
  .cardpop-enter-active,
  .cardpop-leave-active {
    transition: opacity var(--dur-fast) var(--ease-out);
  }
  .cardpop-enter-from,
  .cardpop-leave-to {
    transform: none;
  }
}

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
