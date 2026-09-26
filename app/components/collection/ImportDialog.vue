<script setup lang="ts">
import type { ImportFormat, ImportRow } from '#shared/collection-csv'
import type { GameId } from '#shared/game'
import type { ImportSource } from '~/composables/useCollectionAdd'
import type { PreviewRow } from '~/composables/useCollectionImport'
import { computed, ref, watch } from 'vue'
import { IMPORT_MAX_ROWS } from '#shared/collection-csv'
import { IMPORT_FORMAT_LABEL } from '~/composables/useCollectionImport'

// Importing a collection from a file (the CSV of ManaBox, Moxfield,
// Cardmarket, Delver Lens, Prism) or a pasted card list: read, matched row by
// row, previewed with what was bent or not found, then imported. The history
// tab lists the last imports, each one a click from undone.
const props = defineProps<{ game: GameId }>()
const open = defineModel<boolean>('open', { required: true })
// What to bring in: a file or a pasted list, a precon (Magic), one of my decks.
const source = defineModel<ImportSource>('source', { default: 'file' })

const { t, locale } = useLocale()
const imp = useCollectionImport(props.game)
const tab = ref<'import' | 'history'>('import')
const pasted = ref('')
const location = ref('')
const dragging = ref(false)
const show = ref<'all' | 'warned' | 'missing'>('all')
const confirmUndo = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

watch(open, (v) => {
  if (v) {
    tab.value = 'import'
    if (imp.step.value === 'done')
      imp.reset()
  }
})
watch(tab, (v) => {
  if (v === 'history')
    void imp.loadHistory()
})

async function readFile(file: File | undefined) {
  if (!file)
    return
  if (file.size > 8 * 1024 * 1024)
    return
  await imp.analyze(await file.text(), file.name)
}
function onDrop(e: DragEvent) {
  dragging.value = false
  void readFile(e.dataTransfer?.files?.[0])
}
function onPick(e: Event) {
  void readFile((e.target as HTMLInputElement).files?.[0])
  ;(e.target as HTMLInputElement).value = ''
}

// The preview shows the first few hundred rows of the chosen kind: enough to
// check, light enough to scroll.
const SHOWN = 300
const filtered = computed(() => imp.preview.value.filter(r => show.value === 'all' || (show.value === 'warned' ? r.printingId && r.warnings.length : !r.printingId)))
const visible = computed(() => filtered.value.slice(0, SHOWN))

const nf = computed(() => new Intl.NumberFormat(locale.value === 'fr' ? 'fr-FR' : 'en-US'))
const date = (ms: number) => new Date(ms).toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
const formatLabel = (f: string) => IMPORT_FORMAT_LABEL[f as ImportFormat] ?? f
const cardName = (r: PreviewRow) => r.card?.printedName ?? r.card?.name ?? r.row.name ?? r.row.number ?? '?'
const issueText = (r: PreviewRow) => (r.error ? [r.error] : r.warnings).map(w => t(`collection.import.issue.${w}`).replace('{lang}', r.row.otherLang ?? '')).join(' · ')

async function undo(id: string) {
  if (confirmUndo.value !== id) {
    confirmUndo.value = id
    return
  }
  confirmUndo.value = null
  await imp.undo(id)
}

const FORMATS = ['ManaBox', 'Moxfield', 'Cardmarket', 'Delver Lens', 'Prism']
const sources = computed(() => [
  { value: 'file' as const, icon: 'i-lucide-file-up', label: 'collection.import.sourceFile' },
  ...(props.game === 'mtg' ? [{ value: 'precon' as const, icon: 'i-lucide-box', label: 'collection.import.sourcePrecon' }] : []),
  { value: 'deck' as const, icon: 'i-lucide-layers', label: 'collection.import.sourceDeck' },
])
function fromRows(rows: ImportRow[], name: string) {
  void imp.analyzeRows(rows, source.value === 'precon' ? 'precon' : 'deck', name)
}
</script>

<template>
  <UModal v-model:open="open" :title="t('collection.import.title')" :description="t('collection.import.description')" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="tab === 'import'" @click="tab = 'import'">
          <UIcon name="i-lucide-upload" class="h-4 w-4" /> {{ t('collection.import.tabImport') }}
        </button>
        <button type="button" role="tab" :aria-selected="tab === 'history'" @click="tab = 'history'">
          <UIcon name="i-lucide-history" class="h-4 w-4" /> {{ t('collection.import.tabHistory') }}
        </button>
      </div>

      <!-- History -->
      <section v-if="tab === 'history'" class="history">
        <p v-if="!imp.history.value.length" class="muted center">
          {{ t('collection.import.noHistory') }}
        </p>
        <ul v-else>
          <li v-for="h in imp.history.value" :key="h.id">
            <span class="fmt">{{ formatLabel(h.format) }}</span>
            <div class="min-w-0 flex-1">
              <p class="h-name">
                {{ h.filename ?? t('collection.import.pastedList') }}
              </p>
              <p class="muted">
                {{ date(h.createdAt) }} · {{ nf.format(h.lines) }} {{ t('collection.import.lines') }} · {{ nf.format(h.copies) }} {{ t('collection.copies') }}
              </p>
            </div>
            <UButton :color="confirmUndo === h.id ? 'error' : 'neutral'" variant="subtle" size="sm" icon="i-lucide-undo-2" :loading="imp.busy.value && confirmUndo === null" @click="undo(h.id)">
              {{ confirmUndo === h.id ? t('collection.import.confirmUndo') : t('collection.import.undo') }}
            </UButton>
          </li>
        </ul>
      </section>

      <!-- 1. Source -->
      <section v-else-if="imp.step.value === 'source'" class="source">
        <div class="sources" role="group">
          <button v-for="s in sources" :key="s.value" type="button" :aria-pressed="source === s.value" @click="source = s.value">
            <UIcon :name="s.icon" class="h-4 w-4" /> {{ t(s.label) }}
          </button>
        </div>
        <CollectionPreconPicker v-if="source === 'precon' && game === 'mtg'" @rows="fromRows" />
        <CollectionDeckPicker v-else-if="source === 'deck'" :game="game" @rows="fromRows" />
        <template v-else>
          <label
            class="drop"
            :class="{ 'is-over': dragging }"
            @dragover.prevent="dragging = true"
            @dragleave="dragging = false"
            @drop.prevent="onDrop"
          >
            <UIcon :name="imp.busy.value ? 'i-lucide-loader-circle' : 'i-lucide-file-up'" class="h-9 w-9" :class="{ 'animate-spin': imp.busy.value }" />
            <b>{{ t('collection.import.drop') }}</b>
            <span class="muted">{{ t('collection.import.dropHint').replace('{n}', nf.format(IMPORT_MAX_ROWS)) }}</span>
            <input ref="fileInput" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" class="sr-only" @change="onPick">
          </label>
          <div class="formats">
            <span v-for="f in (game === 'mtg' ? FORMATS : ['Prism'])" :key="f" class="chip">{{ f }}</span>
            <span class="chip chip--mono">{{ game === 'mtg' ? '4 Sol Ring (CMM) 400' : '4x OP01-016' }}</span>
          </div>
          <div class="paste">
            <UTextarea v-model="pasted" :rows="5" :placeholder="t(`collection.import.pastePlaceholder.${game}`)" class="w-full" autoresize :maxrows="12" />
            <UButton :disabled="!pasted.trim()" :loading="imp.busy.value" icon="i-lucide-scan-search" @click="imp.analyze(pasted)">
              {{ t('collection.import.analyze') }}
            </UButton>
          </div>
        </template>
      </section>

      <!-- 2. Preview -->
      <section v-else-if="imp.step.value === 'preview'" class="preview">
        <div class="summary">
          <span class="fmt">{{ formatLabel(imp.parsed.value?.format ?? 'csv') }}</span>
          <span v-if="imp.filename.value" class="file">{{ imp.filename.value }}</span>
          <div class="stats">
            <span class="ok"><UIcon name="i-lucide-circle-check" class="h-4 w-4" /> {{ nf.format(imp.counts.value.ok) }}</span>
            <span v-if="imp.counts.value.warned" class="warn"><UIcon name="i-lucide-triangle-alert" class="h-4 w-4" /> {{ nf.format(imp.counts.value.warned) }}</span>
            <span v-if="imp.counts.value.missing" class="bad"><UIcon name="i-lucide-circle-x" class="h-4 w-4" /> {{ nf.format(imp.counts.value.missing) }}</span>
          </div>
        </div>
        <p v-if="imp.counts.value.unreadable" class="note">
          <UIcon name="i-lucide-file-warning" class="h-4 w-4" />
          {{ t('collection.import.unreadable').replace('{n}', String(imp.counts.value.unreadable)).replace('{lines}', imp.parsed.value!.errors.slice(0, 8).map(e => e.line).join(', ')) }}
        </p>
        <p v-if="imp.parsed.value?.truncated" class="note">
          <UIcon name="i-lucide-scissors" class="h-4 w-4" />
          {{ t('collection.import.truncated').replace('{n}', nf.format(IMPORT_MAX_ROWS)) }}
        </p>

        <div class="seg" role="group">
          <button type="button" :aria-pressed="show === 'all'" @click="show = 'all'">
            {{ t('collection.show.all') }} <span>{{ nf.format(imp.preview.value.length) }}</span>
          </button>
          <button type="button" :aria-pressed="show === 'warned'" :disabled="!imp.counts.value.warned" @click="show = 'warned'">
            {{ t('collection.import.warned') }} <span>{{ nf.format(imp.counts.value.warned) }}</span>
          </button>
          <button type="button" :aria-pressed="show === 'missing'" :disabled="!imp.counts.value.missing" @click="show = 'missing'">
            {{ t('collection.import.missing') }} <span>{{ nf.format(imp.counts.value.missing) }}</span>
          </button>
        </div>

        <div class="table" role="table">
          <div v-for="r in visible" :key="r.row.line" class="tr" :class="{ 'is-bad': !r.printingId, 'is-warn': r.printingId && r.warnings.length }" role="row">
            <img v-if="r.card?.thumb" :src="r.card.thumb" alt="" class="thumb" loading="lazy">
            <span v-else class="thumb thumb--empty"><UIcon name="i-lucide-help-circle" class="h-4 w-4" /></span>
            <div class="min-w-0 flex-1">
              <p class="t-name">
                {{ cardName(r) }}
              </p>
              <p class="t-meta">
                <template v-if="r.card">
                  {{ r.card.set.toUpperCase() }} · #{{ r.card.number }} · {{ r.card.lang.toUpperCase() }}
                </template>
                <template v-else>
                  {{ t('collection.import.lineN').replace('{n}', String(r.row.line)) }}<template v-if="r.row.set">
                    · {{ r.row.set.toUpperCase() }}
                  </template><template v-if="r.row.number">
                    #{{ r.row.number }}
                  </template>
                </template>
              </p>
              <p v-if="r.error || r.warnings.length" class="t-issue">
                {{ issueText(r) }}
              </p>
            </div>
            <span v-if="r.finish !== 'nonfoil'" class="tag tag--foil">{{ t(`collection.finish.${r.finish}`) }}</span>
            <span class="tag">{{ r.row.condition }}</span>
            <span class="qty">×{{ r.row.quantity }}</span>
          </div>
          <p v-if="filtered.length > SHOWN" class="muted center more">
            {{ t('collection.import.more').replace('{n}', nf.format(filtered.length - SHOWN)) }}
          </p>
        </div>

        <UFormField :label="t('collection.import.location')" :hint="t('collection.import.locationHint')">
          <UInput v-model="location" icon="i-lucide-archive" :placeholder="t('collection.locationPlaceholder')" class="w-full" />
        </UFormField>
      </section>

      <!-- 3. Done -->
      <section v-else class="done">
        <div class="done-art">
          <UIcon name="i-lucide-check" class="h-9 w-9" />
        </div>
        <h3>{{ t('collection.import.doneTitle').replace('{n}', nf.format(imp.result.value?.copies ?? 0)) }}</h3>
        <p class="muted">
          {{ t('collection.import.doneBody').replace('{n}', nf.format(imp.result.value?.lines ?? 0)) }}
        </p>
      </section>
    </template>

    <template v-if="tab === 'import' && imp.step.value !== 'source'" #footer>
      <div class="foot">
        <template v-if="imp.step.value === 'preview'">
          <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" @click="imp.reset()">
            {{ t('collection.import.back') }}
          </UButton>
          <UButton :disabled="!imp.importable.value.length" :loading="imp.busy.value" icon="i-lucide-download" size="lg" @click="imp.commit(location)">
            {{ t('collection.import.commit').replace('{n}', nf.format(imp.counts.value.copies)) }}
          </UButton>
        </template>
        <template v-else>
          <UButton color="neutral" variant="ghost" icon="i-lucide-undo-2" :loading="imp.busy.value" @click="imp.undo(imp.result.value!.importId)">
            {{ t('collection.import.undoThis') }}
          </UButton>
          <UButton icon="i-lucide-check" size="lg" @click="open = false">
            {{ t('collection.import.close') }}
          </UButton>
        </template>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--color-border-subtle);
}
.tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: -1px;
  padding: 8px 12px;
  border-bottom: 2px solid transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-muted);
}
.tabs button[aria-selected='true'] {
  border-bottom-color: var(--ui-primary);
  color: var(--color-text-high);
}
.muted {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}
.center {
  padding: 28px 0;
  text-align: center;
}
.source {
  display: grid;
  gap: 14px;
}
.drop {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 30px 20px;
  border: 2px dashed var(--color-border-strong);
  border-radius: var(--radius-xl);
  background: var(--color-surface-1);
  color: var(--color-text-mid);
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.drop:hover,
.drop.is-over {
  border-color: var(--ui-primary);
  background: var(--accent-soft);
}
.sources {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 6px;
}
.sources button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-mid);
}
.sources button[aria-pressed='true'] {
  border-color: var(--ui-primary);
  background: var(--accent-soft);
  color: var(--color-text-high);
}
.formats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--color-surface-2);
  font-size: 12px;
  color: var(--color-text-mid);
}
.chip--mono {
  font-family: var(--font-mono);
}
.paste {
  display: grid;
  justify-items: end;
  gap: 8px;
}
.preview {
  display: grid;
  gap: 12px;
}
.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.fmt {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--accent-soft);
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-text);
}
.file {
  overflow: hidden;
  max-width: 280px;
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-muted);
}
.stats {
  display: flex;
  gap: 14px;
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
}
.stats span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.ok {
  color: #23945a;
}
.warn {
  color: #b27510;
}
.bad {
  color: var(--color-error, #c0392b);
}
.note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}
.seg {
  display: flex;
  gap: 2px;
  width: fit-content;
  padding: 2px;
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-sm);
}
.seg button {
  padding: 4px 10px;
  border-radius: calc(var(--radius-sm) - 2px);
  font-size: 12px;
  color: var(--color-text-muted);
}
.seg button:disabled {
  opacity: 0.45;
}
.seg button span {
  margin-left: 3px;
  font-family: var(--font-mono);
  font-size: 11px;
}
.seg button[aria-pressed='true'] {
  background: var(--color-surface-3);
  color: var(--color-text-high);
}
.table {
  overflow-y: auto;
  max-height: 44vh;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
}
.tr {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--color-border-hairline);
}
.tr:last-child {
  border-bottom: 0;
}
.tr.is-warn {
  background: rgba(214, 150, 30, 0.06);
}
.tr.is-bad {
  background: rgba(192, 57, 43, 0.06);
}
.thumb {
  flex: 0 0 auto;
  width: 28px;
  height: 39px;
  border-radius: 3px;
  object-fit: cover;
}
.thumb--empty {
  display: grid;
  place-items: center;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
}
.t-name {
  overflow: hidden;
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-high);
}
.t-meta {
  margin: 1px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
}
.t-issue {
  margin: 2px 0 0;
  font-size: 11px;
  color: #b27510;
}
.is-bad .t-issue {
  color: var(--color-error, #c0392b);
}
.tag {
  flex: 0 0 auto;
  padding: 1px 6px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-mid);
}
.tag--foil {
  border-color: transparent;
  background: linear-gradient(110deg, #ffd6e8, #d6f0ff 50%, #fff3c4);
  color: #2b2b2b;
}
.qty {
  flex: 0 0 auto;
  width: 42px;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-high);
}
.more {
  padding: 12px 0;
}
.history ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.history li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
}
.h-name {
  overflow: hidden;
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-text-high);
}
.done {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 24px 0;
  text-align: center;
}
.done h3 {
  margin: 6px 0 0;
  font-size: 20px;
  color: var(--color-text-high);
}
.done-art {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(46, 160, 98, 0.16);
  color: #23945a;
  animation: pop 0.45s var(--ease-out, ease-out);
}
@keyframes pop {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
}
.foot {
  display: flex;
  justify-content: space-between;
  width: 100%;
}
</style>
