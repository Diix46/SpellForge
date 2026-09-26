import type { CollectionCard, Finish } from '#shared/collection'
import type { ImportFormat, ImportRow, ParsedImport } from '#shared/collection-csv'
import type { GameId } from '#shared/game'
import { computed, ref, shallowRef } from 'vue'
import { parseImport } from '#shared/collection-csv'

export type ImportIssue = 'notFound' | 'otherLang' | 'noLangPrinting' | 'langKept' | 'setNotFound' | 'finishChanged'

/** A file row with the printing the server matched (see server/utils/collection/import.ts). */
export interface PreviewRow {
  row: ImportRow
  printingId: string | null
  /** Magic: the copy's language, kept when Scryfall lists no printing in it. */
  lang: 'fr' | 'en' | null
  finish: Finish
  card: CollectionCard | null
  error: ImportIssue | null
  warnings: ImportIssue[]
}

export interface ImportRecord {
  id: string
  format: string
  filename: string | null
  lines: number
  copies: number
  createdAt: number
}

/**
 * Importing a file into a collection: read it here, have the server match
 * each row, show the preview, then import what matched (kept in the history,
 * to undo).
 */
export function useCollectionImport(game: GameId) {
  const { t } = useLocale()
  const toast = useToast()
  const collection = useCollection(game)

  const step = ref<'source' | 'preview' | 'done'>('source')
  const busy = ref(false)
  const filename = ref<string | null>(null)
  const parsed = shallowRef<ParsedImport | null>(null)
  const preview = shallowRef<PreviewRow[]>([])
  const result = ref<{ importId: string, lines: number, copies: number } | null>(null)
  const history = ref<ImportRecord[]>([])

  const message = (e: unknown) => (e as { data?: { message?: string } })?.data?.message ?? t('collection.error')

  function reset() {
    step.value = 'source'
    filename.value = null
    parsed.value = null
    preview.value = []
    result.value = null
  }

  /** Read the text, have every row matched, show the preview. */
  async function analyze(text: string, name: string | null = null) {
    await analyzeParsed(parseImport(text), name)
  }

  /** Rows made elsewhere (a precon, a deck), previewed the same way. */
  async function analyzeRows(rows: ImportRow[], format: ImportFormat, name: string) {
    await analyzeParsed({ format, rows, errors: [], truncated: false }, name)
  }

  async function analyzeParsed(p: ParsedImport, name: string | null) {
    filename.value = name
    parsed.value = p
    if (!p.rows.length) {
      toast.add({ title: t('collection.import.nothing'), color: 'warning', icon: 'i-lucide-file-question' })
      return
    }
    busy.value = true
    try {
      const res = await $fetch<{ rows: Omit<PreviewRow, 'row'>[] }>('/api/collection/import/preview', { method: 'POST', body: { game, rows: p.rows } })
      preview.value = res.rows.map((r, i) => ({ ...r, row: p.rows[i]! }))
      step.value = 'preview'
    }
    catch (e) {
      toast.add({ title: message(e), color: 'error', icon: 'i-lucide-circle-alert' })
    }
    finally {
      busy.value = false
    }
  }

  const importable = computed(() => preview.value.filter(r => r.printingId))
  /** What deserves a look: a copy's language kept is only information. */
  const problems = (r: PreviewRow) => r.warnings.filter(w => w !== 'langKept')
  const counts = computed(() => ({
    ok: importable.value.filter(r => !problems(r).length).length,
    warned: importable.value.filter(r => problems(r).length).length,
    missing: preview.value.length - importable.value.length,
    unreadable: parsed.value?.errors.length ?? 0,
    copies: importable.value.reduce((n, r) => n + r.row.quantity, 0),
  }))

  /** Import what matched; `location` fills the rows that name none. */
  async function commit(location: string) {
    busy.value = true
    try {
      const items = importable.value.map(r => ({
        printingId: r.printingId,
        finish: r.finish,
        condition: r.row.condition,
        lang: r.lang ?? undefined,
        quantity: r.row.quantity,
        purchasePrice: r.row.purchasePrice,
        location: r.row.location ?? (location.trim() || null),
        note: r.row.note,
      }))
      result.value = await $fetch('/api/collection/import', { method: 'POST', body: { game, format: parsed.value?.format ?? 'csv', filename: filename.value, items } })
      step.value = 'done'
      await collection.load(true)
    }
    catch (e) {
      toast.add({ title: message(e), color: 'error', icon: 'i-lucide-circle-alert' })
    }
    finally {
      busy.value = false
    }
  }

  async function loadHistory() {
    try {
      history.value = (await $fetch<{ imports: ImportRecord[] }>('/api/collection/imports', { query: { game } })).imports
    }
    catch {
      history.value = []
    }
  }

  /** Take an import back out of the collection. */
  async function undo(id: string) {
    busy.value = true
    try {
      const res = await $fetch<{ copies: number }>(`/api/collection/imports/${encodeURIComponent(id)}`, { method: 'DELETE' })
      history.value = history.value.filter(h => h.id !== id)
      if (result.value?.importId === id)
        reset()
      await collection.load(true)
      toast.add({ title: t('collection.import.undone').replace('{n}', String(res.copies)), color: 'neutral', icon: 'i-lucide-undo-2' })
    }
    catch (e) {
      toast.add({ title: message(e), color: 'error', icon: 'i-lucide-circle-alert' })
    }
    finally {
      busy.value = false
    }
  }

  return { step, busy, filename, parsed, preview, importable, problems, counts, result, history, reset, analyze, analyzeRows, commit, loadHistory, undo }
}

/** How each format is named to people. */
export const IMPORT_FORMAT_LABEL: Record<ImportFormat, string> = {
  prism: 'Prism',
  manabox: 'ManaBox',
  moxfield: 'Moxfield',
  cardmarket: 'Cardmarket',
  delver: 'Delver Lens',
  csv: 'CSV',
  text: 'Liste',
  precon: 'Precon',
  deck: 'Deck',
}
