<script setup lang="ts">
import type { CommandItem } from '~/composables/useCommandPaletteSearch'
import { nextTick, ref, watch } from 'vue'
import { useCommandPalette } from '~/composables/useCommandPalette'
import { useCommandPaletteSearch } from '~/composables/useCommandPaletteSearch'
import { useLocale } from '~/composables/useLocale'

const { open, hide } = useCommandPalette()
const { t } = useLocale()
const router = useRouter()

const q = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const sel = ref(0)

function go(path: string) {
  hide()
  router.push(path)
}
function openScryfall(name: string) {
  hide()
  window.open(`https://scryfall.com/search?q=${encodeURIComponent(`!"${name}"`)}`, '_blank')
}

// Data layer (actions / decks / live card autocomplete / filter + group).
const { results, grouped, reset } = useCommandPaletteSearch(q, { go, openScryfall })

watch(results, () => {
  sel.value = 0
})

function flatIndex(it: CommandItem) {
  return results.value.findIndex(r => r.id === it.id)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    sel.value = Math.min(sel.value + 1, results.value.length - 1)
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    sel.value = Math.max(sel.value - 1, 0)
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    results.value[sel.value]?.run()
  }
}

// focus + reset on open
watch(open, async (isOpen) => {
  if (isOpen) {
    q.value = ''
    reset()
    sel.value = 0
    await nextTick()
    inputEl.value?.focus()
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="cmdk">
      <div
        v-if="open"
        class="cmdk-scrim"
        :style="{ zIndex: 'var(--z-modal)' }"
        @click.self="hide"
      >
        <div class="cmdk glass-strong">
          <!-- search -->
          <div class="cmdk-search">
            <UIcon name="i-lucide-search" class="h-[18px] w-[18px] text-(--color-text-muted)" />
            <input
              ref="inputEl"
              v-model="q"
              type="text"
              :placeholder="t('cmd.placeholder')"
              autocomplete="off"
              spellcheck="false"
              @keydown="onKey"
            >
            <kbd class="cmdk-esc">esc</kbd>
          </div>

          <!-- results -->
          <div class="cmdk-results">
            <p v-if="!results.length" class="cmdk-empty">
              {{ t('cmd.empty') }}
            </p>
            <template v-for="g in grouped" :key="g.group">
              <div class="cmdk-group">
                {{ g.group }}
              </div>
              <button
                v-for="it in g.items"
                :key="it.id"
                type="button"
                class="cmdk-item"
                :class="{ sel: flatIndex(it) === sel }"
                @mousemove="sel = flatIndex(it)"
                @click="it.run()"
              >
                <UIcon :name="it.icon" class="cmdk-ic" />
                <span class="cmdk-label">{{ it.label }}</span>
                <span v-if="it.hint" class="cmdk-hint">{{ it.hint }}</span>
                <kbd v-if="it.kbd" class="cmdk-kbd">⌘{{ it.kbd }}</kbd>
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cmdk-scrim {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  background: rgba(6, 6, 8, 0.55);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}
.cmdk {
  width: 600px;
  max-width: 92vw;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-elev-3), var(--accent-glow);
  overflow: hidden;
}
.cmdk-search {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--color-border-hairline);
}
.cmdk-search input {
  flex: 1;
  background: none;
  border: 0;
  outline: none;
  color: var(--color-text-high);
  font: inherit;
  font-size: 15.5px;
  letter-spacing: -0.01em;
}
.cmdk-search input::placeholder {
  color: var(--color-text-disabled);
}
.cmdk-esc {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
  background: var(--color-surface-3);
  border: 1px solid var(--color-border-subtle);
  border-radius: 5px;
  padding: 2px 6px;
}
.cmdk-results {
  padding: 8px;
  max-height: 56vh;
  overflow-y: auto;
}
.cmdk-empty {
  padding: 28px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
}
.cmdk-group {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-text-disabled);
  padding: 10px 10px 4px;
  font-weight: 500;
}
.cmdk-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  color: var(--color-text-mid);
  font-size: 13.5px;
  text-align: left;
  transition: none;
}
.cmdk-item.sel {
  background: var(--accent-soft);
  color: var(--color-text-high);
}
.cmdk-ic {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--color-text-muted);
}
.cmdk-item.sel .cmdk-ic {
  color: var(--accent-text);
}
.cmdk-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmdk-hint {
  font-size: 11px;
  color: var(--color-text-disabled);
  font-family: var(--font-mono);
}
.cmdk-kbd {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
  background: var(--color-surface-3);
  border: 1px solid var(--color-border-subtle);
  border-radius: 5px;
  padding: 1px 5px;
}

.cmdk-enter-active,
.cmdk-leave-active {
  transition: opacity var(--dur) var(--ease-out);
}
.cmdk-enter-active .cmdk,
.cmdk-leave-active .cmdk {
  transition: transform var(--dur) var(--ease-spring);
}
.cmdk-enter-from,
.cmdk-leave-to {
  opacity: 0;
}
.cmdk-enter-from .cmdk,
.cmdk-leave-to .cmdk {
  transform: translateY(-10px) scale(0.98);
}
</style>
