/**
 * The collection's add dialog, opened from anywhere on the collection pages:
 * empty, or on a card and printing (a checklist's missing card).
 */
export function useCollectionAdd() {
  const state = useState('collection-add', () => ({ open: false, query: undefined as string | undefined, printing: undefined as string | undefined }))
  function openAdd(from?: { query: string, printing?: string }) {
    state.value = { open: true, query: from?.query, printing: from?.printing }
  }
  return { state, openAdd }
}

/** Where a game's collection lives. */
export function collectionPath(game: 'mtg' | 'optcg', sub = ''): string {
  return `${game === 'mtg' ? '/magic' : '/one-piece'}/collection${sub}`
}
