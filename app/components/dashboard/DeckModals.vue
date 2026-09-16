<script setup lang="ts">
import type { GameId } from '#shared/game'
import { useLocale } from '~/composables/useLocale'

// The dashboard's four modals (new deck / import / rename / delete). Pure
// presentation: open-state and input values are v-models; the page wires them to
// useDashboardModals and listens for the action events. Extracted from index.vue
// to keep the page lean (the user prefers many small components).

defineProps<{
  showNewDeck: boolean
  newDeckName: string
  newDeckGame: GameId
  showImport: boolean
  importUrl: string
  importGame: GameId
  importText: string
  importing: boolean
  showRename: boolean
  renameValue: string
  showDelete: boolean
  deleteName: string
}>()

const emit = defineEmits<{
  'update:showNewDeck': [v: boolean]
  'update:newDeckName': [v: string]
  'update:newDeckGame': [v: GameId]
  'update:showImport': [v: boolean]
  'update:importUrl': [v: string]
  'update:importGame': [v: GameId]
  'update:importText': [v: string]
  'update:showRename': [v: boolean]
  'update:renameValue': [v: string]
  'update:showDelete': [v: boolean]
  'create': []
  'import': []
  'rename': []
  'confirmDelete': []
}>()

const { t } = useLocale()

// Shared modal chrome (overlay + glass content) for all four dialogs.
const modalUi = {
  overlay: 'bg-ink-950/70 backdrop-blur-[6px]',
  content: 'glass rounded-[var(--radius-2xl)]',
}
</script>

<template>
  <!-- NEW DECK -->
  <UModal
    :open="showNewDeck"
    :title="t('modal.newDeck')"
    :ui="modalUi"
    @update:open="emit('update:showNewDeck', $event)"
  >
    <template #body>
      <fieldset class="worlds">
        <legend class="worlds-legend">
          {{ t('modal.chooseWorld') }}
        </legend>
        <button
          type="button"
          class="world world--op"
          :aria-pressed="newDeckGame === 'optcg'"
          @click="emit('update:newDeckGame', 'optcg')"
        >
          <span class="world-name">One Piece</span>
          <span class="world-rule">{{ t('modal.worldOp') }}</span>
        </button>
        <button
          type="button"
          class="world world--mtg"
          :aria-pressed="newDeckGame === 'mtg'"
          @click="emit('update:newDeckGame', 'mtg')"
        >
          <span class="world-name">Magic</span>
          <span class="world-rule">{{ t('modal.worldMtg') }}</span>
        </button>
      </fieldset>
      <UFormField :label="t('modal.deckName')">
        <UInput
          :model-value="newDeckName"
          name="new-deck-name"
          :placeholder="newDeckGame === 'optcg' ? t('modal.namePlaceholderOp') : t('modal.namePlaceholderMtg')"
          autofocus
          class="w-full font-mono"
          @update:model-value="emit('update:newDeckName', String($event))"
          @keyup.enter="emit('create')"
        />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="subtle" @click="emit('update:showNewDeck', false)">
          {{ t('modal.cancel') }}
        </UButton>
        <UButton color="primary" icon="i-lucide-sparkles" @click="emit('create')">
          {{ t('modal.create') }}
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- DELETE CONFIRM -->
  <UModal
    :open="showDelete"
    :title="t('modal.deleteTitle')"
    :ui="modalUi"
    @update:open="emit('update:showDelete', $event)"
  >
    <template #body>
      <p class="text-(--color-text-mid)">
        {{ t('modal.deleteBody') }}
        <span class="font-semibold text-(--color-text-high)">{{ deleteName }}</span>{{ t('modal.deleteEnd') }}
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="subtle" @click="emit('update:showDelete', false)">
          {{ t('modal.cancel') }}
        </UButton>
        <UButton color="error" icon="i-lucide-trash-2" @click="emit('confirmDelete')">
          {{ t('tile.delete') }}
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- RENAME -->
  <UModal
    :open="showRename"
    :title="t('modal.rename')"
    :ui="modalUi"
    @update:open="emit('update:showRename', $event)"
  >
    <template #body>
      <UFormField :label="t('modal.deckName')">
        <UInput
          :model-value="renameValue"
          name="rename-deck"
          autofocus
          class="w-full font-mono"
          @update:model-value="emit('update:renameValue', String($event))"
          @keyup.enter="emit('rename')"
        />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="subtle" @click="emit('update:showRename', false)">
          {{ t('modal.cancel') }}
        </UButton>
        <UButton color="primary" @click="emit('rename')">
          {{ t('modal.save') }}
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- IMPORT -->
  <UModal
    :open="showImport"
    :title="t('modal.importDeck')"
    :ui="modalUi"
    @update:open="emit('update:showImport', $event)"
  >
    <template #body>
      <fieldset class="worlds">
        <legend class="worlds-legend">
          {{ t('modal.chooseWorld') }}
        </legend>
        <button
          type="button"
          class="world world--op"
          :aria-pressed="importGame === 'optcg'"
          @click="emit('update:importGame', 'optcg')"
        >
          <span class="world-name">One Piece</span>
          <span class="world-rule">{{ t('modal.importOpRule') }}</span>
        </button>
        <button
          type="button"
          class="world world--mtg"
          :aria-pressed="importGame === 'mtg'"
          @click="emit('update:importGame', 'mtg')"
        >
          <span class="world-name">Magic</span>
          <span class="world-rule">{{ t('modal.importMtgRule') }}</span>
        </button>
      </fieldset>
      <div v-if="importGame === 'mtg'" class="space-y-3">
        <UFormField :label="t('modal.importUrl')" :help="t('modal.importUrlHelp')">
          <UInput
            :model-value="importUrl"
            name="import-url"
            placeholder="https://edhrec.com/commanders/atraxa-praetors-voice"
            autofocus
            class="w-full font-mono text-sm"
            @update:model-value="emit('update:importUrl', String($event))"
            @keyup.enter="emit('import')"
          />
        </UFormField>
        <UAlert
          color="info"
          variant="soft"
          icon="i-lucide-info"
          :title="t('modal.examples')"
          :description="t('modal.importExamples')"
        />
      </div>
      <UFormField v-else :label="t('modal.importList')" :help="t('modal.importListHelp')">
        <UTextarea
          :model-value="importText"
          name="import-list"
          :rows="9"
          autoresize
          placeholder="1xOP05-060&#10;4xOP05-067&#10;4xOP05-069"
          class="w-full font-mono text-sm"
          @update:model-value="emit('update:importText', String($event))"
        />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="subtle" @click="emit('update:showImport', false)">
          {{ t('modal.cancel') }}
        </UButton>
        <UButton color="primary" :loading="importing" icon="i-lucide-download" @click="emit('import')">
          {{ t('modal.import') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.worlds {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0 0 16px;
  padding: 0;
  border: 0;
}
.worlds-legend {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-high);
}
.world {
  display: grid;
  gap: 4px;
  padding: 14px;
  text-align: left;
  border: 2px solid transparent;
  transition:
    transform 0.3s cubic-bezier(0.3, 1.7, 0.5, 1),
    border-color 0.2s ease;
}
.world:hover {
  transform: translateY(-2px);
}
.world--op {
  rotate: -1deg;
  border-radius: 2px;
  background: linear-gradient(180deg, #fbf3e3, #efdfc0);
  color: #231708;
}
.world--mtg {
  border-radius: 4px;
  background: linear-gradient(180deg, #17131d, #0b0910);
  color: #f3ecda;
}
.world--op[aria-pressed='true'] {
  border-color: #c9312a;
}
.world--mtg[aria-pressed='true'] {
  border-color: #d4af5f;
}
.world-name {
  font-size: 20px;
  line-height: 1;
}
.world--op .world-name {
  font-family: 'Anton', Impact, sans-serif;
  text-transform: uppercase;
}
.world--mtg .world-name {
  font-family: 'Cinzel', ui-serif, Georgia, serif;
  font-weight: 700;
  color: #d4af5f;
}
.world-rule {
  font-size: 12px;
  opacity: 0.8;
}
</style>
