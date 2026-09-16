import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import type { GameId } from '#shared/game'
import { ref, watch } from 'vue'
import { totalCards } from '#shared/decklist'
import { deckPath, parseGameId } from '#shared/game'
import { optcgLine, orderOptcgEntries, parseOptcgDecklist } from '#shared/optcg/decklist'
import { useDeckStore } from '~/composables/useDeckStore'

// Owns the dashboard's four modals (new / import / rename / delete): their open
// state, the bound input values, and the create/import/rename/delete handlers.
// Extracted from index.vue so the page stays a thin orchestrator and the modal
// state-machine (incl. the ?new / ?import deep-link sync) lives in one place.

export function useDashboardModals(route: RouteLocationNormalizedLoaded, router: Router) {
  const { decks, createDeck, deleteDeck, updateDeck } = useDeckStore()
  const { locale, t } = useLocale()
  const toast = useToast()

  // New deck: the game is chosen in the modal (or preset by ?new=optcg).
  const showNewDeck = ref(false)
  const newDeckName = ref('')
  const newDeckGame = ref<GameId>('mtg')

  // Import
  const showImport = ref(false)
  const importUrl = ref('')
  // Magic imports a public URL; One Piece a pasted list.
  const importGame = ref<GameId>('mtg')
  const importText = ref('')
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
    if (q.new)
      newDeckGame.value = parseGameId(q.new) ?? newDeckGame.value
    else if (q.import)
      importGame.value = parseGameId(q.import) ?? importGame.value
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

  async function handleImport() {
    if (importing.value)
      return
    if (importGame.value === 'optcg')
      return importOptcg()
    if (!importUrl.value.trim())
      return
    importing.value = true
    try {
      const result = await $fetch<{ name: string, raw: string, source: string, cardCount: number }>('/api/import', {
        method: 'POST',
        body: { url: importUrl.value.trim() },
      })
      // URL import reads EDHREC and Archidekt, both Magic-only.
      const deck = createDeck({ name: result.name, game: 'mtg', raw: result.raw, source: result.source })
      toast.add({
        title: t('modal.imported'),
        description: `${result.name} · ${result.cardCount} ${t('dash.cards')}`,
        color: 'success',
        icon: 'i-lucide-check',
      })
      showImport.value = false
      importUrl.value = ''
      await navigateTo(deckPath(deck))
    }
    catch (err: unknown) {
      // The server names the case; the message is ours to write.
      const code = (err as { data?: { data?: { code?: unknown } } } | null)?.data?.data?.code
      const known = typeof code === 'string' ? t(`modal.importError.${code}`) : ''
      toast.add({
        title: t('modal.importFailed'),
        description: known && !known.startsWith('modal.') ? known : errMessage(err) || t('modal.unknownError'),
        color: 'error',
        icon: 'i-lucide-x',
      })
    }
    finally {
      importing.value = false
    }
  }

  /**
   * A pasted One Piece list becomes a deck, its Leader moved first (the
   * dashboard tile and the rules read it there). Unreadable lines are kept at
   * the end so the workshop can show them.
   */
  async function importOptcg() {
    const { mainboard, errors } = parseOptcgDecklist(importText.value)
    if (!mainboard.length) {
      toast.add({ title: t('modal.importFailed'), description: t('modal.importListEmpty'), color: 'error', icon: 'i-lucide-x' })
      return
    }
    importing.value = true
    try {
      const { cards } = await $fetch<{ cards: ({ category: string } | null)[] }>('/api/optcg/resolve', {
        method: 'POST',
        body: { lang: locale.value, entries: mainboard.map(e => ({ number: e.name })) },
      })
      const leaders = new Set(mainboard.filter((_, i) => cards[i]?.category === 'Leader').map(e => e.name))
      const ordered = orderOptcgEntries(mainboard, n => leaders.has(n)).map(optcgLine)
      const leaderIndex = mainboard.findIndex(e => leaders.has(e.name))
      const name = leaderIndex >= 0 && cards[leaderIndex]
        ? `${t('optcg.library.newDeckName')} ${(cards[leaderIndex] as { name?: string }).name ?? ''}`.trim()
        : t('nav.newDeck')
      const deck = createDeck({ name, game: 'optcg', raw: [...ordered, ...errors].join('\n') })
      toast.add({ title: t('modal.imported'), description: `${name} · ${totalCards(mainboard)} ${t('dash.cards')}`, color: 'success', icon: 'i-lucide-check' })
      showImport.value = false
      importText.value = ''
      await navigateTo(deckPath(deck))
    }
    catch (err: unknown) {
      toast.add({ title: t('modal.importFailed'), description: errMessage(err) || t('modal.unknownError'), color: 'error', icon: 'i-lucide-x' })
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
    newDeckGame,
    showImport,
    importUrl,
    importGame,
    importText,
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
