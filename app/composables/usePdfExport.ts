import type { ResolvedCard } from './useScryfall'
import { jsPDF } from 'jspdf'

export type PageFormat = 'a4' | 'a3'
export type Orientation = 'portrait' | 'landscape'

// Real Magic card size in mm.
const CARD_W_MM = 63
const CARD_H_MM = 88

const PAGE_DIMS: Record<PageFormat, { width: number, height: number }> = {
  a4: { width: 210, height: 297 },
  a3: { width: 297, height: 420 },
}

export interface PdfSettings {
  format: PageFormat
  orientation: Orientation
  marginMm: number
  gapMm: number
  cutGuides: boolean
  includeBack: boolean
}

export interface PdfProgress {
  loaded: number
  total: number
  phase: 'loading' | 'rendering' | 'done'
}

interface ImageData {
  dataUrl: string
  format: 'PNG' | 'JPEG'
}

// Cache loaded images across exports (A4 then A3) so we don't re-download.
const imageCache = new Map<string, ImageData>()

async function loadImageAsDataUrl(url: string): Promise<ImageData | null> {
  if (imageCache.has(url))
    return imageCache.get(url)!

  try {
    // Scryfall's image CDN has no CORS headers, so fetch through our proxy
    // to get a same-origin response we can read into a data URL.
    const proxied = `/api/proxy-image?url=${encodeURIComponent(url)}`
    const res = await fetch(proxied)
    if (!res.ok)
      return null
    const blob = await res.blob()

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

    const format: 'PNG' | 'JPEG' = blob.type.includes('png') ? 'PNG' : 'JPEG'
    const result: ImageData = { dataUrl, format }
    imageCache.set(url, result)
    return result
  }
  catch {
    return null
  }
}

export function usePdfExport() {
  function computeLayout(settings: PdfSettings) {
    const dims = PAGE_DIMS[settings.format]
    const pageW = settings.orientation === 'portrait' ? dims.width : dims.height
    const pageH = settings.orientation === 'portrait' ? dims.height : dims.width

    const availW = pageW - settings.marginMm * 2
    const availH = pageH - settings.marginMm * 2

    const cols = Math.max(1, Math.floor((availW + settings.gapMm) / (CARD_W_MM + settings.gapMm)))
    const rows = Math.max(1, Math.floor((availH + settings.gapMm) / (CARD_H_MM + settings.gapMm)))

    const gridW = cols * CARD_W_MM + (cols - 1) * settings.gapMm
    const gridH = rows * CARD_H_MM + (rows - 1) * settings.gapMm

    // Center the grid on the page.
    const offsetX = (pageW - gridW) / 2
    const offsetY = (pageH - gridH) / 2

    return { pageW, pageH, cols, rows, perPage: cols * rows, offsetX, offsetY }
  }

  /** Flatten resolved cards into an ordered list of image URLs respecting quantities. */
  function buildImageList(cards: ResolvedCard[], includeBack: boolean): string[] {
    const fronts: string[] = []
    const backs: string[] = []

    for (const c of cards) {
      if (!c.imageUrl)
        continue
      for (let i = 0; i < c.entry.quantity; i++) fronts.push(c.imageUrl)
    }
    if (includeBack) {
      for (const c of cards) {
        if (!c.backImageUrl)
          continue
        for (let i = 0; i < c.entry.quantity; i++) backs.push(c.backImageUrl)
      }
    }
    return [...fronts, ...backs]
  }

  async function generatePdf(
    cards: ResolvedCard[],
    settings: PdfSettings,
    onProgress?: (p: PdfProgress) => void,
  ): Promise<jsPDF> {
    const layout = computeLayout(settings)
    const imageUrls = buildImageList(cards, settings.includeBack)

    // Pre-load all unique images.
    const uniqueUrls = [...new Set(imageUrls)]
    let loaded = 0
    const loadedImages = new Map<string, ImageData | null>()

    for (const url of uniqueUrls) {
      const img = await loadImageAsDataUrl(url)
      loadedImages.set(url, img)
      loaded++
      onProgress?.({ loaded, total: uniqueUrls.length, phase: 'loading' })
    }

    onProgress?.({ loaded: uniqueUrls.length, total: uniqueUrls.length, phase: 'rendering' })

    // eslint-disable-next-line new-cap -- jsPDF is an external class with a lowercase name
    const doc = new jsPDF({
      orientation: settings.orientation,
      unit: 'mm',
      format: settings.format,
    })

    const { cols, perPage, offsetX, offsetY } = layout

    for (let i = 0; i < imageUrls.length; i++) {
      const pageIndex = Math.floor(i / perPage)
      const slotInPage = i % perPage
      const col = slotInPage % cols
      const row = Math.floor(slotInPage / cols)

      if (slotInPage === 0 && pageIndex > 0) {
        doc.addPage(settings.format, settings.orientation)
      }

      const x = offsetX + col * (CARD_W_MM + settings.gapMm)
      const y = offsetY + row * (CARD_H_MM + settings.gapMm)

      const url = imageUrls[i]
      const img = url ? loadedImages.get(url) : null
      if (img) {
        doc.addImage(img.dataUrl, img.format, x, y, CARD_W_MM, CARD_H_MM, undefined, 'FAST')
      }
      else {
        // Placeholder for failed image
        doc.setDrawColor(200)
        doc.rect(x, y, CARD_W_MM, CARD_H_MM)
      }

      if (settings.cutGuides) {
        drawCutGuides(doc, x, y, layout)
      }
    }

    onProgress?.({ loaded: uniqueUrls.length, total: uniqueUrls.length, phase: 'done' })
    return doc
  }

  /** Draw thin crop marks at the corners of a card slot (extending into the margin). */
  function drawCutGuides(
    doc: jsPDF,
    x: number,
    y: number,
    layout: ReturnType<typeof computeLayout>,
  ) {
    const len = 3 // mm crop-mark length
    doc.setDrawColor(160)
    doc.setLineWidth(0.1)

    const right = x + CARD_W_MM
    const bottom = y + CARD_H_MM

    // Only draw marks that stay on the page.
    const corners: Array<[number, number]> = [
      [x, y],
      [right, y],
      [x, bottom],
      [right, bottom],
    ]

    for (const [cx, cy] of corners) {
      // Horizontal tick
      doc.line(Math.max(0, cx - len), cy, Math.min(layout.pageW, cx + len), cy)
      // Vertical tick
      doc.line(cx, Math.max(0, cy - len), cx, Math.min(layout.pageH, cy + len))
    }
  }

  async function exportPdf(
    cards: ResolvedCard[],
    settings: PdfSettings,
    filename: string,
    onProgress?: (p: PdfProgress) => void,
  ): Promise<void> {
    const doc = await generatePdf(cards, settings, onProgress)
    doc.save(filename)
  }

  /** Generate a PDF and return a blob URL (for preview in an iframe). */
  async function generatePdfBlobUrl(
    cards: ResolvedCard[],
    settings: PdfSettings,
    onProgress?: (p: PdfProgress) => void,
  ): Promise<string> {
    const doc = await generatePdf(cards, settings, onProgress)
    const blob = doc.output('blob')
    return URL.createObjectURL(blob)
  }

  return {
    computeLayout,
    buildImageList,
    generatePdf,
    exportPdf,
    generatePdfBlobUrl,
    CARD_W_MM,
    CARD_H_MM,
  }
}
