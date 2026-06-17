import type { DeckEntry } from './useDecklist'
import type { ScryfallCard } from './useScryfall'
import { computed, ref } from 'vue'
import { useDecklist } from './useDecklist'
import { allowsAnyQuantity, isBasicLand } from './useMtg'

export interface ValidationIssue {
  level: 'error' | 'warning'
  /** i18n key + optional interpolation value. */
  key: string
  value?: string | number
}

/**
 * Stateful deck-editing layer on top of the raw decklist text.
 * The raw string stays the source of truth (so PDF/Cardmarket/import keep
 * working); this composable parses it, exposes structured ops, and serialises
 * back to raw on every change.
 */
export function useDeckBuilder(rawModel: { get: () => string, set: (v: string) => void }) {
  const { parse } = useDecklist()

  // Working list of entries (mainboard + commander). Sideboard is preserved verbatim.
  const entries = ref<DeckEntry[]>([])
  const commanderName = ref<string>('')
  let sideboardRaw = ''

  function load() {
    const raw = rawModel.get()
    const parsed = parse(raw)
    entries.value = parsed.mainboard.map(e => ({ ...e }))
    // Preserve sideboard lines verbatim when serialising.
    sideboardRaw = parsed.sideboard.length
      ? `\nSideboard\n${parsed.sideboard.map(e => `${e.quantity} ${e.name}`).join('\n')}`
      : ''
  }

  function serialise() {
    const lines = entries.value.map((e) => {
      // Preserve a pinned printing as the Arena "(SET) NUM" suffix so it
      // round-trips through the raw decklist and survives reloads.
      const suffix = e.set && e.collectorNumber ? ` (${e.set.toUpperCase()}) ${e.collectorNumber}` : ''
      return `${e.quantity} ${e.name}${suffix}`
    })
    rawModel.set(lines.join('\n') + sideboardRaw)
  }

  function findIndex(name: string): number {
    const n = name.trim().toLowerCase()
    return entries.value.findIndex(e => e.name.trim().toLowerCase() === n)
  }

  function addCard(name: string, opts: { set?: string, collectorNumber?: string } = {}) {
    const idx = findIndex(name)
    if (idx >= 0) {
      // Singleton except basics: only bump quantity for basic lands.
      if (isBasicLand(name))
        entries.value[idx]!.quantity += 1
    }
    else {
      entries.value.push({ quantity: 1, name: name.trim(), set: opts.set, collectorNumber: opts.collectorNumber })
    }
    serialise()
  }

  function addScryfallCard(card: ScryfallCard) {
    // Prefer the canonical (English) name for storage; printing-agnostic.
    addCard(card.name)
  }

  function removeCard(name: string) {
    const idx = findIndex(name)
    if (idx >= 0) {
      entries.value.splice(idx, 1)
      serialise()
    }
  }

  function setQuantity(name: string, qty: number) {
    const idx = findIndex(name)
    if (idx < 0)
      return
    if (qty <= 0) {
      entries.value.splice(idx, 1)
    }
    else {
      entries.value[idx]!.quantity = qty
    }
    serialise()
  }

  function setCommander(name: string) {
    commanderName.value = name.trim()
    // Ensure the commander is present in the list.
    if (findIndex(name) < 0)
      addCard(name)
    else serialise()
  }

  /** Pin a specific printing (set + collector number) on a card, or clear it. */
  function setPrinting(name: string, set?: string, collectorNumber?: string) {
    const idx = findIndex(name)
    if (idx < 0)
      return
    entries.value[idx]!.set = set
    entries.value[idx]!.collectorNumber = collectorNumber
    serialise()
  }

  const totalCards = computed(() => entries.value.reduce((s, e) => s + e.quantity, 0))

  const uniqueCount = computed(() => entries.value.length)

  return {
    entries,
    commanderName,
    totalCards,
    uniqueCount,
    load,
    serialise,
    addCard,
    addScryfallCard,
    removeCard,
    setQuantity,
    setCommander,
    setPrinting,
    findIndex,
  }
}

/**
 * EDH/Commander validation. Pure function over the current entries + resolved
 * card data (type lines, color identities) so it can run live in the UI.
 */
export function validateCommander(
  entries: DeckEntry[],
  opts: {
    commanderName?: string
    /** name(lower) → color identity letters, when known (from Scryfall). */
    identityByName?: Map<string, string[]>
    /** the commander's own color identity, when known. */
    commanderIdentity?: string[]
  } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const total = entries.reduce((s, e) => s + e.quantity, 0)

  if (total !== 100)
    issues.push({ level: total > 100 ? 'error' : 'warning', key: 'valid.size', value: total })

  // Singleton rule (basics + "any number" cards exempt).
  for (const e of entries) {
    if (e.quantity > 1 && !allowsAnyQuantity(e.name))
      issues.push({ level: 'error', key: 'valid.singleton', value: e.name })
  }

  // Color identity: every card must be within the commander's identity.
  if (opts.commanderIdentity && opts.identityByName) {
    const allowed = new Set(opts.commanderIdentity.map(c => c.toLowerCase()))
    for (const e of entries) {
      const id = opts.identityByName.get(e.name.trim().toLowerCase())
      if (!id)
        continue // unknown — skip (don't false-flag before cards resolve)
      const outOfId = id.some(c => !allowed.has(c.toLowerCase()))
      if (outOfId)
        issues.push({ level: 'error', key: 'valid.identity', value: e.name })
    }
  }

  if (!opts.commanderName)
    issues.push({ level: 'warning', key: 'valid.noCommander' })

  return issues
}
