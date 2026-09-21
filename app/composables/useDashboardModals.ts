import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import type { GameId } from '#shared/game'
import { ref, watch } from 'vue'
import { deckPath, parseGameId } from '#shared/game'
import { useDeckStore } from '~/composables/useDeckStore'
import { useImportOverlay } from '~/composables/useImportOverlay'

// Owns the dashboard's modals (new / rename / delete): their open state, the
// bound input values, and the create/rename/delete handlers.
// Extracted from index.vue so the page stays a thin orchestrator and the modal
// state-machine (incl. the ?new / ?import deep-link sync) lives in one place.
// Importing a deck is the shell's own dialog (useImportOverlay), shared with
// the top bar and the workshop.

export function useDashboardModals(route: RouteLocationNormalizedLoaded, router: Router) {
  const { decks, createDeck, deleteDeck, updateDeck } = useDeckStore()
  const importOverlay = useImportOverlay()
  const { locale, t } = useLocale()
  const toast = useToast()

  // New deck: the game is chosen in the modal (or preset by ?new=optcg).
  const showNewDeck = ref(false)
  const newDeckName = ref('')
  const newDeckGame = ref<GameId>('mtg')

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
    if (q.new)
      newDeckGame.value = parseGameId(q.new) ?? newDeckGame.value
    // Importing is the shell's dialog, the same one the top bar opens.
    else if (q.import)
      importOverlay.show({ game: parseGameId(q.import) ?? undefined })
    // Strip ONLY our action params, preserving any other query state.
    const { new: _new, import: _import, ...rest } = q
    router.replace({ query: rest })
  }, { immediate: true })

  async function handleCreate() {
    // A second Enter while the page changes must not create a second deck.
    if (!showNewDeck.value)
      return
    const deck = createDeck({ name: newDeckName.value || t('nav.newDeck'), game: newDeckGame.value })
    showNewDeck.value = false
    newDeckName.value = ''
    await navigateTo(deckPath(deck))
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
    newDeckGame,
    showRename,
    renameValue,
    showDelete,
    deleteName,
    handleCreate,
    requestDelete,
    confirmDelete,
    openRename,
    handleRename,
  }
}
