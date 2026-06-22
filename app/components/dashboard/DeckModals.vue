<script setup lang="ts">
import { useLocale } from '~/composables/useLocale'

// The dashboard's four modals (new deck / import / rename / delete). Pure
// presentation: open-state and input values are v-models; the page wires them to
// useDashboardModals and listens for the action events. Extracted from index.vue
// to keep the page lean (the user prefers many small components).

defineProps<{
  showNewDeck: boolean
  newDeckName: string
  showImport: boolean
  importUrl: string
  importing: boolean
  showRename: boolean
  renameValue: string
  showDelete: boolean
  deleteName: string
}>()

const emit = defineEmits<{
  'update:showNewDeck': [v: boolean]
  'update:newDeckName': [v: string]
  'update:showImport': [v: boolean]
  'update:importUrl': [v: string]
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
      <UFormField :label="t('modal.deckName')">
        <UInput
          :model-value="newDeckName"
          name="new-deck-name"
          placeholder="ex. Atraxa Superfriends"
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
        <span class="font-semibold text-(--color-text-high)">{{ deleteName }}</span> ?
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
      <div class="space-y-3">
        <UFormField :label="t('modal.edhrecUrl')" :help="t('modal.edhrecHelp')">
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
          description="edhrec.com/commanders/<nom> • edhrec.com/average-decks/<nom> • edhrec.com/deckpreview/<id>"
        />
      </div>
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
