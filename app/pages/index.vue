<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDecklist } from '~/composables/useDecklist'
import { useDeckStore } from '~/composables/useDeckStore'

const { locale, t } = useLocale()

useSeoMeta({
  title: () => t('dash.title'),
  description: 'Gérez vos decklists Magic: The Gathering, imprimez vos proxies en FR/EN.',
})

const route = useRoute()
const router = useRouter()
const { decks, createDeck, deleteDeck, duplicateDeck, updateDeck } = useDeckStore()
const { parse, totalCards } = useDecklist()
const toast = useToast()

// Modals
const showNewDeck = ref(false)
const newDeckName = ref('')
const showImport = ref(false)
const importUrl = ref('')
const importing = ref(false)

// Rename
const showRename = ref(false)
const renameId = ref('')
const renameValue = ref('')

// Delete confirmation
const showDelete = ref(false)
const deleteId = ref('')
const deleteName = ref('')

// Open new-deck modal when arriving with ?new=1 (header button)
onMounted(() => {
  if (route.query.new) {
    showNewDeck.value = true
    router.replace({ query: {} })
  }
})

const totalCardsAll = computed(() =>
  decks.value.reduce((sum, d) => {
    const { mainboard, sideboard } = parse(d.raw)
    return sum + totalCards(mainboard) + totalCards(sideboard)
  }, 0),
)

const lastUpdated = computed(() => {
  if (!decks.value.length)
    return '—'
  const ts = Math.max(...decks.value.map(d => d.updatedAt))
  return new Date(ts).toLocaleDateString(locale.value === 'fr' ? 'fr-FR' : 'en-US', { day: '2-digit', month: 'short' })
})

async function handleCreate() {
  const deck = createDeck(newDeckName.value || t('nav.newDeck'))
  showNewDeck.value = false
  newDeckName.value = ''
  await navigateTo(`/deck/${deck.id}`)
}

async function handleImport() {
  if (!importUrl.value.trim())
    return
  importing.value = true
  try {
    const result = await $fetch<{ name: string, raw: string, source: string, cardCount: number }>('/api/import', {
      method: 'POST',
      body: { url: importUrl.value.trim() },
    })
    const deck = createDeck(result.name, result.raw, result.source)
    toast.add({
      title: locale.value === 'fr' ? 'Deck importé' : 'Deck imported',
      description: `${result.name} — ${result.cardCount} ${t('dash.cards')}`,
      color: 'success',
      icon: 'i-lucide-check',
    })
    showImport.value = false
    importUrl.value = ''
    await navigateTo(`/deck/${deck.id}`)
  }
  catch (err: unknown) {
    toast.add({
      title: locale.value === 'fr' ? 'Import échoué' : 'Import failed',
      description: errMessage(err) || (locale.value === 'fr' ? 'Erreur inconnue' : 'Unknown error'),
      color: 'error',
      icon: 'i-lucide-x',
    })
  }
  finally {
    importing.value = false
  }
}

function requestDelete(id: string, name: string) {
  deleteId.value = id
  deleteName.value = name
  showDelete.value = true
}

function confirmDelete() {
  if (deleteId.value) {
    deleteDeck(deleteId.value)
    toast.add({ title: locale.value === 'fr' ? 'Deck supprimé' : 'Deck deleted', color: 'neutral', icon: 'i-lucide-trash-2' })
  }
  showDelete.value = false
}

function openRename(id: string) {
  const deck = decks.value.find(d => d.id === id)
  if (!deck)
    return
  renameId.value = id
  renameValue.value = deck.name
  showRename.value = true
}

function handleRename() {
  if (renameValue.value.trim()) {
    updateDeck(renameId.value, { name: renameValue.value.trim() })
  }
  showRename.value = false
}

const modalUi = {
  overlay: 'bg-ink-950/70 backdrop-blur-[6px]',
  content: 'glass rounded-[var(--radius-2xl)]',
}
</script>

<template>
  <div class="fade-up">
    <!-- HERO -->
    <section class="relative mb-12">
      <div class="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div class="relative">
            <h1 class="font-display text-4xl font-extrabold leading-tight tracking-tight text-(--color-text-high) md:text-5xl">
              {{ t('dash.title') }}
            </h1>
            <!-- halo duplicate -->
            <h1
              aria-hidden="true"
              class="pointer-events-none absolute inset-0 font-display text-4xl font-extrabold leading-tight tracking-tight text-(--color-text-high) opacity-15 blur-2xl md:text-5xl"
            >
              {{ t('dash.title') }}
            </h1>
          </div>
          <p class="mt-3 max-w-lg text-(--color-text-mid)">
            {{ t('dash.subtitle') }}
          </p>
          <hr class="rule-gradient mt-5 w-56 border-0">
        </div>

        <!-- stat chips + actions -->
        <div class="flex flex-col items-start gap-4 md:items-end">
          <div class="flex gap-2">
            <UButton
              icon="i-lucide-download"
              color="neutral"
              variant="subtle"
              class="glass-solid"
              @click="showImport = true"
            >
              {{ t('nav.import') }}
            </UButton>
            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="solid"
              class="transition-shadow"
              @click="showNewDeck = true"
            >
              {{ t('nav.newDeck') }}
            </UButton>
          </div>
          <div class="flex gap-2">
            <div class="glass-solid rounded-[var(--radius-md)] px-3 py-1.5 text-center">
              <div class="font-mono text-lg font-semibold text-(--color-text-high)">
                {{ decks.length }}
              </div>
              <div class="font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
                {{ t('dash.decks') }}
              </div>
            </div>
            <div class="glass-solid rounded-[var(--radius-md)] px-3 py-1.5 text-center">
              <div class="font-mono text-lg font-semibold text-(--color-text-high)">
                {{ totalCardsAll }}
              </div>
              <div class="font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
                {{ t('dash.cards') }}
              </div>
            </div>
            <div class="glass-solid rounded-[var(--radius-md)] px-3 py-1.5 text-center">
              <div class="font-mono text-lg font-semibold text-(--color-text-high)">
                {{ lastUpdated }}
              </div>
              <div class="font-mono text-[10px] uppercase tracking-wider text-(--color-text-muted)">
                {{ t('dash.lastUpdate') }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- EMPTY STATE -->
    <div
      v-if="decks.length === 0"
      class="glass mx-auto flex max-w-xl flex-col items-center justify-center rounded-[var(--radius-2xl)] py-16 text-center"
    >
      <div class="bob mb-5 grid h-20 w-20 place-items-center rounded-[var(--radius-xl)] bg-(--color-surface-2)">
        <UIcon
          name="i-lucide-layers"
          class="h-10 w-10 text-(--color-text-mid)"
          style="filter: drop-shadow(0 0 10px rgba(255,255,255,.2))"
        />
      </div>
      <h2 class="font-display text-xl font-semibold text-(--color-text-high)">
        {{ t('dash.empty.title') }}
      </h2>
      <p class="mt-2 mb-7 max-w-sm text-(--color-text-muted)">
        {{ t('dash.empty.body') }}
      </p>
      <div class="flex flex-wrap justify-center gap-3">
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="solid"
          size="lg"
          @click="showNewDeck = true"
        >
          {{ t('dash.empty.create') }}
        </UButton>
        <UButton
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          size="lg"
          @click="showImport = true"
        >
          {{ t('dash.empty.import') }}
        </UButton>
      </div>
    </div>

    <!-- DECK GRID -->
    <div
      v-else
      class="grid gap-5"
      style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))"
    >
      <!-- new deck tile (marching ants) -->
      <button
        class="group relative flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] border border-dashed border-(--color-border-strong) bg-(--color-surface-1)/60 text-(--color-text-mid) transition-all hover:border-(--color-text-muted) hover:bg-(--color-surface-1) hover:text-(--color-text-high)"
        @click="showNewDeck = true"
      >
        <UIcon
          name="i-lucide-plus"
          class="h-8 w-8 transition-transform group-hover:scale-110"
        />
        <span class="font-medium">{{ t('nav.newDeck') }}</span>
      </button>

      <DeckTile
        v-for="deck in decks"
        :key="deck.id"
        :deck="deck"
        @open="(id) => navigateTo(`/deck/${id}`)"
        @duplicate="(id) => duplicateDeck(id)"
        @delete="requestDelete"
        @rename="openRename"
      />
    </div>

    <!-- NEW DECK MODAL -->
    <UModal
      v-model:open="showNewDeck"
      :title="t('modal.newDeck')"
      :ui="modalUi"
    >
      <template #body>
        <UFormField :label="t('modal.deckName')">
          <UInput
            v-model="newDeckName"
            name="new-deck-name"
            placeholder="ex. Atraxa Superfriends"
            autofocus
            class="w-full font-mono"
            @keyup.enter="handleCreate"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="subtle"
            @click="showNewDeck = false"
          >
            {{ t('modal.cancel') }}
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-sparkles"
            @click="handleCreate"
          >
            {{ t('modal.create') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- DELETE CONFIRM MODAL -->
    <UModal
      v-model:open="showDelete"
      :title="t('modal.deleteTitle')"
      :ui="modalUi"
    >
      <template #body>
        <p class="text-(--color-text-mid)">
          {{ t('modal.deleteBody') }}
          <span class="font-semibold text-(--color-text-high)">{{ deleteName }}</span> ?
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="subtle"
            @click="showDelete = false"
          >
            {{ t('modal.cancel') }}
          </UButton>
          <UButton
            color="error"
            icon="i-lucide-trash-2"
            @click="confirmDelete"
          >
            {{ t('tile.delete') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- RENAME MODAL -->
    <UModal
      v-model:open="showRename"
      :title="t('modal.rename')"
      :ui="modalUi"
    >
      <template #body>
        <UFormField :label="t('modal.deckName')">
          <UInput
            v-model="renameValue"
            name="rename-deck"
            autofocus
            class="w-full font-mono"
            @keyup.enter="handleRename"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="subtle"
            @click="showRename = false"
          >
            {{ t('modal.cancel') }}
          </UButton>
          <UButton
            color="primary"
            @click="handleRename"
          >
            {{ t('modal.save') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- IMPORT MODAL -->
    <UModal
      v-model:open="showImport"
      :title="t('modal.importDeck')"
      :ui="modalUi"
    >
      <template #body>
        <div class="space-y-3">
          <UFormField
            :label="t('modal.edhrecUrl')"
            :help="t('modal.edhrecHelp')"
          >
            <UInput
              v-model="importUrl"
              name="import-url"
              placeholder="https://edhrec.com/commanders/atraxa-praetors-voice"
              autofocus
              class="w-full font-mono text-sm"
              @keyup.enter="handleImport"
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
          <UButton
            color="neutral"
            variant="subtle"
            @click="showImport = false"
          >
            {{ t('modal.cancel') }}
          </UButton>
          <UButton
            color="primary"
            :loading="importing"
            icon="i-lucide-download"
            @click="handleImport"
          >
            {{ t('modal.import') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
