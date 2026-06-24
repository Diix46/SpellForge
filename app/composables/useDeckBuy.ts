import type { ComputedRef, Ref } from 'vue'
import type { BuyLang } from '~/composables/useCardmarket'
import type { PriceSummary } from '~/composables/useDeckAnalysis'
import type { DeckEntry } from '~/composables/useDecklist'
import type { ResolvedCard } from '~/composables/useScryfall'
import { computed, ref } from 'vue'
import { useCardmarket } from '~/composables/useCardmarket'
import { displayName } from '~/composables/useMtg'
import { getImageUris } from '~/composables/useScryfall'

// Buy/checkout concerns for the deck page: per-card Cardmarket pricing rows, the
// cost summary, the marketplace-language toggle, and the one-step "buy the whole
// deck" + per-card link helpers. Extracted from deck/[id].vue to keep the page
// an orchestrator. Pure derivation over the deck's resolved cards.

export interface BuyRow {
  name: string // localized display name
  enName: string // English name (for the Cardmarket search)
  quantity: number
  unit: number | null // EUR per copy (null = unknown)
  lineTotal: number | null
  url: string
  thumb: string | null
}

interface BuyCtx {
  resolvedCards: Ref<ResolvedCard[]>
  allEntries: ComputedRef<DeckEntry[]>
  price: ComputedRef<PriceSummary>
  /** Resolve a (possibly localized) entry name to its ResolvedCard, if loaded. */
  resolvedFor: (name: string) => ResolvedCard | undefined
  /** Site locale — drives FR/EN display names and the default marketplace. */
  locale: Ref<'en' | 'fr'> | ComputedRef<'en' | 'fr'>
}

export function useDeckBuy(ctx: BuyCtx) {
  const { resolvedCards, allEntries, price, resolvedFor, locale } = ctx
  const { searchUrl, linksForResolved, wantsListText, wantsListImportUrl } = useCardmarket()
  const { t } = useLocale()
  const toast = useToast()

  // Cardmarket marketplace language (which site locale to open links in). Cards
  // are always matched by English name; this only changes the shop's UI language.
  // Defaults to the site locale so a FR user lands on the FR marketplace.
  const buyLang = ref<BuyLang>(locale.value === 'fr' ? 'fr' : 'en')

  // Resolved cards, or a name-only fallback when nothing is resolved yet.
  const cardsOrFallback = computed<ResolvedCard[]>(() =>
    resolvedCards.value.length
      ? resolvedCards.value
      : allEntries.value.map(e => ({ entry: e, card: null, imageUrl: null, backImageUrl: null, lang: 'en' } as ResolvedCard)),
  )

  const cmLinks = computed(() => linksForResolved(cardsOrFallback.value, buyLang.value))

  const buyRows = computed<BuyRow[]>(() => {
    const isFr = locale.value === 'fr'
    const rows: BuyRow[] = cardsOrFallback.value.map((rc) => {
      const enName = rc.card?.name ?? rc.entry.name
      const eur = rc.priceEur ?? rc.card?.prices?.eur
      const unit = eur ? Number.parseFloat(eur) : Number.NaN
      const hasPrice = Number.isFinite(unit)
      return {
        name: displayName(rc.card, isFr) || rc.entry.name,
        enName,
        quantity: rc.entry.quantity,
        unit: hasPrice ? unit : null,
        lineTotal: hasPrice ? Math.round(unit * rc.entry.quantity * 100) / 100 : null,
        url: searchUrl(enName, buyLang.value),
        thumb: getImageUris(rc.card)?.small ?? null,
      }
    })
    // Priced cards first (most expensive on top), then unknown-price cards by name.
    return rows.sort((a, b) => {
      if (a.lineTotal == null && b.lineTotal == null)
        return a.name.localeCompare(b.name)
      if (a.lineTotal == null)
        return 1
      if (b.lineTotal == null)
        return -1
      return b.lineTotal - a.lineTotal
    })
  })

  const buySummary = computed(() => {
    const total = price.value.total
    const priced = buyRows.value.filter(r => r.lineTotal != null)
    const units = priced.reduce((s, r) => s + r.quantity, 0)
    return {
      total,
      missing: price.value.missing,
      avg: units ? Math.round((total / units) * 100) / 100 : 0,
      priciest: priced[0] ?? null,
    }
  })

  function fmtEur(n: number): string {
    return `${n.toFixed(2)} €`
  }

  function openAllCardmarket() {
    // Browsers block all but the first popup from one gesture, so open the first
    // card and copy the rest of the links to the clipboard.
    const links = cmLinks.value
    if (!links.length)
      return
    window.open(links[0]!.url, '_blank')
    if (links.length > 1) {
      navigator.clipboard.writeText(links.map(l => l.url).join('\n'))
      toast.add({
        title: t('toast.linksCopied'),
        description: `${links.length} ${t('editor.cardsWord')}`,
        color: 'info',
        icon: 'i-lucide-clipboard-copy',
      })
    }
  }

  // Decklist entries with English names for Cardmarket (which matches by English
  // name only). Prefers the resolved canonical name; falls back to the typed name
  // when a card isn't resolved yet (e.g. a French entry the user hasn't loaded).
  const enEntries = computed(() =>
    allEntries.value.map(e => ({ ...e, name: resolvedFor(e.name)?.card?.name ?? e.name })),
  )

  function copyWantsList() {
    navigator.clipboard.writeText(wantsListText(enEntries.value))
    toast.add({
      title: t('toast.listCopied'),
      description: t('toast.listCopiedDesc'),
      color: 'success',
      icon: 'i-lucide-clipboard-check',
    })
  }

  // One-step "buy the whole deck": copy the Cardmarket-formatted wants list to the
  // clipboard, then open Cardmarket's wants-list import page — the user pastes once
  // and Cardmarket builds the buyable list (closest to 1-click without a partner API).
  function buyWholeDeck() {
    navigator.clipboard.writeText(wantsListText(enEntries.value)).catch(() => {})
    window.open(wantsListImportUrl(buyLang.value), '_blank')
    toast.add({
      title: t('buy.wantsCopiedTitle'),
      description: t('buy.wantsCopiedDesc'),
      color: 'success',
      icon: 'i-lucide-clipboard-check',
    })
  }

  return {
    buyLang,
    cmLinks,
    buyRows,
    buySummary,
    fmtEur,
    openAllCardmarket,
    enEntries,
    copyWantsList,
    buyWholeDeck,
  }
}
