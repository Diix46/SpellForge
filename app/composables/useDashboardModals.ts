import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { ref, watch } from 'vue'
import { useDeckStore } from '~/composables/useDeckStore'

// Owns the dashboard's four modals (new / import / rename / delete): their open
// state, the bound input values, and the create/import/rename/delete handlers.
// Extracted from index.vue so the page stays a thin orchestrator and the modal
// state-machine (incl. the ?new / ?import deep-link sync) lives in one place.

export function useDashboardModals(route: RouteLocationNormalizedLoaded, router: Router) {
  const { decks, createDeck, deleteDeck, updateDeck } = useDeckStore()
  const { locale, t } = useLocale()
  const toast = useToast()

  // New deck
  const showNewDeck = ref(false)
  const newDeckName = ref('')

  // Import
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

  // Open the right modal when arriving via a sidebar/topbar query (?new / ?import).
  // A watcher (not onMounted) so it also fires when the query changes while the
  // dashboard is already mounted — Vue Router reuses the component otherwise.
  watch(() => route.query, (q) => {
    if (!q.new && !q.import)
      return
    // Exactly one modal at a time (a stray ?new&import, or switching while one is
    // open, shouldn't stack them).
    showNewDeck.value = !!q.new
    showImport.value = !q.new && !!q.import
    // Strip ONLY our action params, preserving any other query state.
    const { new: _new, import: _import, ...rest } = q
    router.replace({ query: rest })
  }, { immediate: true })

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
    if (renameValue.value.trim())
      updateDeck(renameId.value, { name: renameValue.value.trim() })
    showRename.value = false
  }

  return {
    showNewDeck,
    newDeckName,
    showImport,
    importUrl,
    importing,
    showRename,
    renameValue,
    showDelete,
    deleteName,
    handleCreate,
    handleImport,
    requestDelete,
    confirmDelete,
    openRename,
    handleRename,
  }
}
