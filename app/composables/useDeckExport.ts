import type { ComputedRef, Ref } from 'vue'
import type { PageFormat, PdfSettings } from '~/composables/usePdfExport'
import type { ResolvedCard } from '~/composables/useScryfall'
import { computed, ref } from 'vue'
import { usePdfExport } from '~/composables/usePdfExport'

// PDF proxy-export concerns for the deck page: the export settings, the in-flight
// state/progress, the export action, and the print-page estimate. Extracted from
// deck/[id].vue. Pure output over the deck's resolved cards.

interface ExportCtx {
  resolvedCards: Ref<ResolvedCard[]>
  /** Cards that actually have an image (printable). */
  successCards: ComputedRef<ResolvedCard[]>
  deckName: Ref<string>
  /** Site/card language, for the output filename. */
  lang: Ref<'en' | 'fr'> | ComputedRef<'en' | 'fr'>
}

export function useDeckExport(ctx: ExportCtx) {
  const { resolvedCards, successCards, deckName, lang } = ctx
  const { exportPdf } = usePdfExport()
  const { t } = useLocale()
  const toast = useToast()

  const settings = ref<Omit<PdfSettings, 'format'>>({
    orientation: 'portrait',
    marginMm: 8,
    gapMm: 1,
    cutGuides: true,
    includeBack: false,
  })

  const exporting = ref<PageFormat | null>(null)
  const exportProgress = ref({ loaded: 0, total: 0, phase: '' })

  // Print-readiness hint: a 100-card EDH deck at 9 cards per A4 page → ~N pages.
  const printPageEstimate = computed(() => Math.max(1, Math.ceil(successCards.value.length / 9)))

  async function doExport(format: PageFormat) {
    if (successCards.value.length === 0) {
      toast.add({ title: t('toast.loadFirst'), color: 'warning', icon: 'i-lucide-alert-triangle' })
      return
    }
    exporting.value = format
    exportProgress.value = { loaded: 0, total: 0, phase: 'loading' }
    try {
      const fullSettings: PdfSettings = { ...settings.value, format }
      const safeName = (deckName.value || 'deck').replace(/[^a-z0-9]+/gi, '_').toLowerCase()
      const filename = `${safeName}_${format.toUpperCase()}_${lang.value}.pdf`
      await exportPdf(resolvedCards.value, fullSettings, filename, (p) => {
        exportProgress.value = { loaded: p.loaded, total: p.total, phase: p.phase }
      })
      toast.add({ title: t('toast.pdfDone'), description: filename, color: 'success', icon: 'i-lucide-file-down' })
    }
    catch (err: unknown) {
      toast.add({ title: t('toast.exportFailed'), description: errMessage(err), color: 'error', icon: 'i-lucide-x' })
    }
    finally {
      exporting.value = null
    }
  }

  return { settings, exporting, exportProgress, printPageEstimate, doExport }
}
