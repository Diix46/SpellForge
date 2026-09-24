import type { DeckEntry } from '#shared/decklist'
import type { ValidationIssue } from '#shared/game'
import type { ScryfallCard } from './useScryfall'
import { computed, ref } from 'vue'
import { writeMtgDecklist } from '#shared/mtg/decklist'
import { samePin } from '#shared/mtg/prints'
import { useDecklist } from './useDecklist'
import { allowsAnyQuantity, isBasicLand } from './useMtg'

export type { ValidationIssue } from '#shared/game'

/**
 * Stateful deck-editing layer on top of the raw decklist text.
 * The raw string stays the source of truth (so PDF/Cardmarket/import keep
 * working); this composable parses it, exposes structured ops, and serialises
 * back to raw on every change.
 */
export function useDeckBuilder(rawModel: { get: () => string, set: (v: string) => void }) {
  const { parse } = useDecklist()

  // Working list of entries (mainboard + commander). The sideboard is kept as
  // is, pinned printings included. The chosen commander is read from, and
  // written back to, the list's "Commander" section.
  const entries = ref<DeckEntry[]>([])
  const commanderName = ref<string>('')
  let sideboard: DeckEntry[] = []

  function load() {
    const parsed = parse(rawModel.get())
    entries.value = parsed.mainboard.map(e => ({ ...e }))
    sideboard = parsed.sideboard
    commanderName.value = parsed.commanders?.[0] ?? ''
  }

  function serialise() {
    rawModel.set(writeMtgDecklist(entries.value, sideboard, commanderName.value))
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

  // Removing the chosen commander drops the choice too.
  function dropCommanderIf(name: string) {
    if (commanderName.value.trim().toLowerCase() === name.trim().toLowerCase())
      commanderName.value = ''
  }

  function removeCard(name: string) {
    const idx = findIndex(name)
    if (idx >= 0) {
      entries.value.splice(idx, 1)
      dropCommanderIf(name)
      serialise()
    }
  }

  function setQuantity(name: string, qty: number) {
    const idx = findIndex(name)
    if (idx < 0)
      return
    if (qty <= 0) {
      entries.value.splice(idx, 1)
      dropCommanderIf(name)
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

  /**
   * Pin (or clear) the printings of many cards in one write, so a deck-wide
   * change is one undo step. Cards not in the deck are skipped; returns how
   * many entries changed.
   */
  function setPrintings(pins: { name: string, set?: string, collectorNumber?: string, lang?: 'en' }[]): number {
    let changed = 0
    for (const p of pins) {
      const entry = entries.value[findIndex(p.name)]
      // Set codes compare case-insensitively: the parser uppercases them, the
      // card database answers in lowercase.
      if (!entry || samePin(entry, p))
        continue
      entry.set = p.set
      entry.collectorNumber = p.collectorNumber
      if (p.lang && p.set)
        entry.lang = p.lang
      else
        delete entry.lang
      changed++
    }
    if (changed)
      serialise()
    return changed
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
    setPrintings,
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
    /** name(lower) of entries that are tokens: printed, never counted. */
    tokenNames?: Set<string>
    /** name(lower) → color identity letters, when known (from Scryfall). */
    identityByName?: Map<string, string[]>
    /** the commander's own color identity, when known. */
    commanderIdentity?: string[]
  } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const counted = opts.tokenNames?.size ? entries.filter(e => !opts.tokenNames!.has(e.name.trim().toLowerCase())) : entries
  const total = counted.reduce((s, e) => s + e.quantity, 0)

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
