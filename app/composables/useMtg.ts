import type { ScryfallCard } from './useScryfall'

// ─── Mana colours ───────────────────────────────────────────────────────────
export type ManaColor = 'w' | 'u' | 'b' | 'r' | 'g'
export const WUBRG: readonly ManaColor[] = ['w', 'u', 'b', 'r', 'g']

/** Filter/normalise a set of colour letters to canonical WUBRG order. */
export function canonicalColors(letters: string[] | undefined | null): ManaColor[] {
  if (!letters?.length)
    return []
  const set = new Set(letters.map(l => l.toLowerCase()))
  return WUBRG.filter(c => set.has(c))
}

// ─── Card type classification ────────────────────────────────────────────────
export type CategoryKey
  = | 'creature' | 'instant' | 'sorcery' | 'artifact'
    | 'enchantment' | 'planeswalker' | 'battle' | 'land' | 'other'

interface CategoryDef { key: CategoryKey, labelKey: string, icon: string, match: RegExp }

// Ordered: the first match wins (creature beats land for "Artifact Land", etc.).
export const CATEGORY_DEFS: readonly CategoryDef[] = [
  { key: 'creature', labelKey: 'type.creature', icon: 'i-lucide-paw-print', match: /creature|créature/i },
  { key: 'instant', labelKey: 'type.instant', icon: 'i-lucide-zap', match: /instant|éphémère|ephemere/i },
  { key: 'sorcery', labelKey: 'type.sorcery', icon: 'i-lucide-flame', match: /sorcery|rituel/i },
  { key: 'artifact', labelKey: 'type.artifact', icon: 'i-lucide-cog', match: /artifact|artefact/i },
  { key: 'enchantment', labelKey: 'type.enchantment', icon: 'i-lucide-sparkles', match: /enchantment|enchantement/i },
  { key: 'planeswalker', labelKey: 'type.planeswalker', icon: 'i-lucide-user-round', match: /planeswalker/i },
  { key: 'battle', labelKey: 'type.battle', icon: 'i-lucide-swords', match: /battle|bataille/i },
  { key: 'land', labelKey: 'type.land', icon: 'i-lucide-mountain', match: /land|terrain/i },
]

/** Classify a type line into a single category (creature beats land, etc.). */
export function classifyType(typeLine: string): CategoryKey {
  if (!typeLine)
    return 'other'
  return CATEGORY_DEFS.find(d => d.match.test(typeLine))?.key ?? 'other'
}

/** i18n label key for a category (incl. the synthetic 'commander'/'other' groups). */
export function categoryLabelKey(key: CategoryKey | 'commander'): string {
  if (key === 'commander')
    return 'commander.label'
  return CATEGORY_DEFS.find(d => d.key === key)?.labelKey ?? 'build.deckTitle'
}

// Display order for grouped deck lists: commander first, then CATEGORY_DEFS, 'other' last.
export const CATEGORY_ORDER: readonly (CategoryKey | 'commander')[] = [
  'commander',
  ...CATEGORY_DEFS.map(d => d.key),
  'other',
]

/** A type line that can be a commander (legendary creature or planeswalker). */
export function isCommanderType(typeLine: string): boolean {
  const tl = typeLine.toLowerCase()
  return tl.includes('legendary') && (tl.includes('creature') || tl.includes('planeswalker'))
}

// ─── Basic lands + "any number" cards (singleton exemptions) ──────────────────
export const BASIC_LANDS: ReadonlySet<string> = new Set([
  'plains',
  'island',
  'swamp',
  'mountain',
  'forest',
  'wastes',
  'plaine',
  'île',
  'ile',
  'marais',
  'montagne',
  'forêt',
  'foret',
  'snow-covered plains',
  'snow-covered island',
  'snow-covered swamp',
  'snow-covered mountain',
  'snow-covered forest',
])

// Cards whose rules text says "A deck can have any number of cards named …".
export const ANY_NUMBER_CARDS: ReadonlySet<string> = new Set([
  'relentless rats',
  'persistent petitioners',
  'rat colony',
  'shadowborn apostle',
  'dragon\'s approach',
  'seven dwarves',
  'nazgûl',
  'nazgul',
  'templar knight',
  'slime against humanity',
])

export function isBasicLand(name: string): boolean {
  return BASIC_LANDS.has(name.trim().toLowerCase())
}

/** Card may be in a deck in any quantity (basics + "any number" cards). */
export function allowsAnyQuantity(name: string): boolean {
  const n = name.trim().toLowerCase()
  return BASIC_LANDS.has(n) || ANY_NUMBER_CARDS.has(n)
}

// ─── Locale-aware display helpers (face-aware where relevant) ─────────────────
type Face = NonNullable<ScryfallCard['card_faces']>[number]

/** Localized display name (FR printed name in FR, English otherwise). */
export function displayName(card: ScryfallCard | null, isFr: boolean, face?: Face | null): string {
  if (face)
    return (isFr ? face.printed_name ?? face.name : face.name) ?? ''
  if (!card)
    return ''
  return (isFr ? card.printed_name ?? card.name : card.name ?? card.printed_name) ?? ''
}

/** Localized type line. */
export function displayType(card: ScryfallCard | null, isFr: boolean, face?: Face | null): string {
  if (face)
    return (isFr ? face.printed_type_line ?? face.type_line : face.type_line ?? face.printed_type_line) ?? ''
  if (!card)
    return ''
  return (isFr ? card.printed_type_line ?? card.type_line : card.type_line ?? card.printed_type_line) ?? ''
}

/** Localized oracle text. */
export function displayOracle(card: ScryfallCard | null, isFr: boolean, face?: Face | null): string {
  if (face)
    return (isFr ? face.printed_text ?? face.oracle_text : face.oracle_text ?? face.printed_text) ?? ''
  if (!card)
    return ''
  return (isFr ? card.printed_text ?? card.oracle_text : card.oracle_text ?? card.printed_text) ?? ''
}

/** Always-English type line (stable for classification), front-face aware. */
export function englishTypeLine(card: ScryfallCard | null): string {
  if (!card)
    return ''
  return card.type_line || card.card_faces?.[0]?.type_line || card.printed_type_line || card.card_faces?.[0]?.printed_type_line || ''
}
