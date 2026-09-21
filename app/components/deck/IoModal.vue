<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { deckPath } from '#shared/game'
import { parseMtgDecklist } from '#shared/mtg/decklist'
import { useDeckImport } from '~/composables/useDeckImport'
import { useDeckStore } from '~/composables/useDeckStore'
import { errMessage } from '~/composables/useErrors'
import { useImportOverlay } from '~/composables/useImportOverlay'

// The one import/export dialog, mounted once in the shell and opened from the
// top bar, the dashboard or the workshop. Always the same thing: a deck link
// or a pasted list goes in, and it either starts a new deck or replaces the
// list of the deck already open. When a deck is open, its list can also be
// copied, downloaded or loaded from a file here.
const { t } = useLocale()
const toast = useToast()
const { open, game, target, fromTarget, hide } = useImportOverlay()
const { createDeck } = useDeckStore()
const { fromUrl, fromText } = useDeckImport()

const url = ref('')
const text = ref('')
const busy = ref(false)
const destination = ref<'new' | 'replace'>('new')
const fileInput = ref<HTMLInputElement | null>(null)

/** The open deck can only take a list of its own game. */
const canReplace = computed(() => !!target.value && target.value.game === game.value)
const replaceLabel = computed(() => `${t('modal.destinationReplace')} « ${target.value?.name() || t('nav.newDeck')} »`)
const title = computed(() => (target.value ? t('build.importExportTitle') : t('modal.importDeck')))
// Unreadable Magic lines, named as the workshop names them.
const badLines = computed(() => (game.value === 'mtg' && text.value.trim() ? parseMtgDecklist(text.value).errors : []))

watch(open, (isOpen) => {
  if (!isOpen)
    return
  url.value = ''
  // Opened from the deck itself: its list is there, ready to be read or edited.
  text.value = fromTarget.value && target.value ? target.value.read() : ''
  destination.value = canReplace.value && fromTarget.value ? 'replace' : 'new'
})
watch(game, () => {
  if (!canReplace.value)
    destination.value = 'new'
})

async function submit() {
  if (busy.value)
    return
  const link = url.value.trim()
  if (!link && !text.value.trim()) {
    toast.add({ title: t('modal.importFailed'), description: t('modal.importEmpty'), color: 'error', icon: 'i-lucide-x' })
    return
  }
  busy.value = true
  try {
    // A link always reads a Magic deck (EDHREC, Archidekt); a list follows the
    // game chosen here.
    const result = link ? await fromUrl(link) : await fromText(game.value, text.value)
    if (destination.value === 'replace' && target.value) {
      target.value.write(result.raw)
      toast.add({ title: t('modal.listReplaced'), description: `${result.count} ${t('dash.cards')}`, color: 'success', icon: 'i-lucide-check' })
      hide()
      return
    }
    const deck = createDeck({ name: result.name, game: link ? 'mtg' : game.value, raw: result.raw, source: result.source })
    toast.add({ title: t('modal.imported'), description: `${result.name} · ${result.count} ${t('dash.cards')}`, color: 'success', icon: 'i-lucide-check' })
    hide()
    await navigateTo(deckPath(deck))
  }
  catch (err: unknown) {
    toast.add({ title: t('modal.importFailed'), description: errMessage(err) || t('modal.unknownError'), color: 'error', icon: 'i-lucide-x' })
  }
  finally {
    busy.value = false
  }
}

async function copyList() {
  try {
    await navigator.clipboard.writeText(target.value?.read() ?? text.value)
    toast.add({ title: t('toast.listCopied'), color: 'success', icon: 'i-lucide-clipboard-check' })
  }
  catch {
    toast.add({ title: t('toast.copyError'), color: 'error', icon: 'i-lucide-x' })
  }
}

function downloadList() {
  const name = (target.value?.name() || 'deck').replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  const url = URL.createObjectURL(new Blob([target.value?.read() ?? text.value], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return
  text.value = await file.text()
  input.value = '' // so the same file can be picked again
}
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    :ui="{ overlay: 'bg-ink-950/70 backdrop-blur-[6px]', content: 'glass rounded-[var(--radius-2xl)]' }"
    @update:open="hide()"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Which game, when the dialog is not tied to an open deck -->
        <fieldset v-if="!target" class="worlds">
          <legend class="worlds-legend">
            {{ t('modal.chooseWorld') }}
          </legend>
          <button
            type="button"
            class="world world--op"
            :aria-pressed="game === 'optcg'"
            @click="game = 'optcg'"
          >
            <span class="world-name">One Piece</span>
            <span class="world-rule">{{ t('modal.importOpRule') }}</span>
          </button>
          <button
            type="button"
            class="world world--mtg"
            :aria-pressed="game === 'mtg'"
            @click="game = 'mtg'"
          >
            <span class="world-name">Magic</span>
            <span class="world-rule">{{ t('modal.importMtgRule') }}</span>
          </button>
        </fieldset>

        <!-- A public link (Magic only) -->
        <UFormField v-if="game === 'mtg'" :label="t('modal.importUrl')" :help="t('modal.importExamples')">
          <UInput
            v-model="url"
            name="import-url"
            placeholder="https://edhrec.com/commanders/atraxa-praetors-voice"
            class="w-full font-mono text-sm"
            @keyup.enter="submit"
          />
        </UFormField>

        <p v-if="game === 'mtg'" class="or">
          <span>{{ t('modal.importOr') }}</span>
        </p>

        <!-- …or the list itself -->
        <UFormField
          :label="t('modal.importList')"
          :help="game === 'mtg' ? t('modal.importMtgListHelp') : t('modal.importListHelp')"
        >
          <UTextarea
            v-model="text"
            name="import-list"
            :rows="game === 'mtg' ? 10 : 9"
            autoresize
            :placeholder="game === 'mtg' ? '1 Atraxa, Praetors\' Voice\n1 Sol Ring' : '1xOP05-060\n4xOP05-067'"
            class="w-full font-mono text-sm"
          />
        </UFormField>
        <div v-if="badLines.length" class="flex flex-wrap gap-1.5">
          <span
            v-for="line in badLines"
            :key="line"
            class="rounded-full border border-(--color-error)/40 bg-(--color-error)/10 px-2.5 py-0.5 text-xs text-(--color-error)"
          >
            {{ t('parse.unrecognized') }} {{ line }}
          </span>
        </div>
        <p v-if="game === 'optcg'" class="text-xs text-(--color-text-muted)">
          <UIcon name="i-lucide-printer-check" class="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          {{ t('optcg.export.noPrint') }}
        </p>

        <!-- Where it lands -->
        <fieldset v-if="canReplace" class="worlds worlds--dest">
          <legend class="worlds-legend">
            {{ t('modal.destination') }}
          </legend>
          <button
            type="button"
            class="world"
            :aria-pressed="destination === 'replace'"
            @click="destination = 'replace'"
          >
            <span class="world-name">{{ replaceLabel }}</span>
          </button>
          <button
            type="button"
            class="world"
            :aria-pressed="destination === 'new'"
            @click="destination = 'new'"
          >
            <span class="world-name">{{ t('modal.destinationNew') }}</span>
          </button>
        </fieldset>
      </div>
    </template>

    <template #footer>
      <input
        ref="fileInput"
        type="file"
        accept=".txt,.dec,text/plain"
        class="hidden"
        @change="onFile"
      >
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <UButton color="neutral" variant="ghost" icon="i-lucide-upload" @click="fileInput?.click()">
          {{ t('build.importFile') }}
        </UButton>
        <template v-if="target">
          <UButton color="neutral" variant="ghost" icon="i-lucide-clipboard-copy" @click="copyList">
            {{ t('build.copy') }}
          </UButton>
          <UButton color="neutral" variant="ghost" icon="i-lucide-file-down" @click="downloadList">
            {{ t('build.downloadTxt') }}
          </UButton>
        </template>
        <UButton color="neutral" variant="subtle" class="ml-auto" @click="hide()">
          {{ t('modal.cancel') }}
        </UButton>
        <UButton color="primary" :loading="busy" icon="i-lucide-download" @click="submit">
          {{ destination === 'replace' ? t('build.apply') : t('modal.import') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
/* Two choices side by side, each one a plate: the game, then the destination. */
.worlds {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.worlds-legend {
  margin-bottom: 8px;
  color: var(--color-text-muted);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.world {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 14px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface-2) 60%, transparent);
  text-align: left;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;
}
.world:hover {
  border-color: var(--accent-border);
}
.world[aria-pressed='true'] {
  border-color: var(--accent-border);
  background: color-mix(in srgb, rgb(var(--accent-rgb)) 12%, transparent);
}
.world-name {
  color: var(--color-text-high);
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.world-rule {
  color: var(--color-text-muted);
  font-size: 12px;
}
.world--op[aria-pressed='true'] {
  border-color: #c9312a;
  background: rgba(201, 49, 42, 0.12);
}
.world--mtg[aria-pressed='true'] {
  border-color: #c9a24e;
  background: rgba(201, 162, 78, 0.12);
}

/* "or paste a list" between the two ways in */
.or {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  color: var(--color-text-muted);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.or::before,
.or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border-subtle);
}
</style>
