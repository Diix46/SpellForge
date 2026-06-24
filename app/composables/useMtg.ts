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
  // 'other' (uncategorised, or types not yet resolved) gets its own label — NOT
  // the panel's "Votre deck" title, which used to leak in as a stray column.
  return CATEGORY_DEFS.find(d => d.key === key)?.labelKey ?? 'type.other'
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

/**
 * Canonical lookup key for a card name (trimmed + lowercased). Use everywhere a
 * name indexes a Map (category/colour/display-name lookups) so normalisation is
 * consistent and lives in one place.
 */
export function cardKey(name: string): string {
  return name.trim().toLowerCase()
}

export function isBasicLand(name: string): boolean {
  return BASIC_LANDS.has(cardKey(name))
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

// ─── Type-line translation (Scryfall often lacks printed_type_line in FR) ─────
// MTG types/supertypes are a closed vocabulary; subtypes are large but finite.
// We translate every token we know and leave the rest (proper-noun subtypes,
// brand-new sets) untouched. Word-level so order/structure is preserved.
const TYPE_FR: Record<string, string> = {
  // supertypes
  Legendary: 'légendaire',
  Basic: 'de base',
  Snow: 'des neiges',
  World: 'monde',
  Ongoing: 'continu',
  // card types
  Creature: 'Créature',
  Creatures: 'Créatures',
  Instant: 'Éphémère',
  Sorcery: 'Rituel',
  Artifact: 'Artefact',
  Enchantment: 'Enchantement',
  Planeswalker: 'Planeswalker',
  Land: 'Terrain',
  Battle: 'Bataille',
  Tribal: 'Tribal',
  Kindred: 'Apparenté',
  Token: 'Jeton',
  Card: 'Carte',
  Dungeon: 'Donjon',
  Plane: 'Plan',
  Scheme: 'Manigance',
  Vanguard: 'Avant-garde',
  Conspiracy: 'Conspiration',
  Phenomenon: 'Phénomène',
  // common land subtypes
  Plains: 'Plaine',
  Island: 'Île',
  Swamp: 'Marais',
  Mountain: 'Montagne',
  Forest: 'Forêt',
  Gate: 'Porte',
  Lair: 'Repaire',
  Locus: 'Locus',
  Mine: 'Mine',
  Tower: 'Tour',
  Cave: 'Grotte',
  Sphere: 'Sphère',
  Desert: 'Désert',
  // common non-creature subtypes
  Equipment: 'Équipement',
  Vehicle: 'Véhicule',
  Aura: 'Aura',
  Saga: 'Saga',
  Curse: 'Malédiction',
  Food: 'Nourriture',
  Treasure: 'Trésor',
  Clue: 'Indice',
  Blood: 'Sang',
  Gold: 'Or',
  Powerstone: 'Pierre de force',
  Shrine: 'Temple',
  Adventure: 'Aventure',
  Class: 'Classe',
  Room: 'Salle',
  Background: 'Historique',
  Fortification: 'Fortification',
  Contraption: 'Bidule',
  Map: 'Carte',
  Incarnation: 'Incarnation',
  Arcane: 'Arcanique',
  Trap: 'Piège',
  // common creature subtypes (high-frequency)
  Human: 'Humain',
  Elf: 'Elfe',
  Goblin: 'Gobelin',
  Zombie: 'Zombie',
  Wizard: 'Sorcier',
  Soldier: 'Soldat',
  Warrior: 'Guerrier',
  Knight: 'Chevalier',
  Cleric: 'Prêtre',
  Rogue: 'Roublard',
  Beast: 'Bête',
  Dragon: 'Dragon',
  Angel: 'Ange',
  Demon: 'Démon',
  Devil: 'Diable',
  Spirit: 'Esprit',
  Elemental: 'Élémental',
  Vampire: 'Vampire',
  Werewolf: 'Loup-garou',
  Wolf: 'Loup',
  Cat: 'Chat',
  Dog: 'Chien',
  Bird: 'Oiseau',
  Snake: 'Serpent',
  Fish: 'Poisson',
  Insect: 'Insecte',
  Spider: 'Araignée',
  Horror: 'Horreur',
  Giant: 'Géant',
  Dwarf: 'Nain',
  Merfolk: 'Ondin',
  Faerie: 'Fée',
  Druid: 'Druide',
  Shaman: 'Chaman',
  Monk: 'Moine',
  Assassin: 'Assassin',
  Berserker: 'Berserker',
  Archer: 'Archer',
  Scout: 'Éclaireur',
  Pirate: 'Pirate',
  Ninja: 'Ninja',
  Samurai: 'Samouraï',
  Wraith: 'Spectre',
  Skeleton: 'Squelette',
  Phoenix: 'Phénix',
  Hydra: 'Hydre',
  Sphinx: 'Sphinx',
  Griffin: 'Griffon',
  Golem: 'Golem',
  Construct: 'Automate',
  Thopter: 'Thoptère',
  Bear: 'Ours',
  Boar: 'Sanglier',
  Ape: 'Singe',
  Rat: 'Rat',
  Bat: 'Chauve-souris',
  Frog: 'Grenouille',
  Lizard: 'Lézard',
  Hound: 'Molosse',
  Horse: 'Cheval',
  Ox: 'Bœuf',
  Elephant: 'Éléphant',
  Whale: 'Baleine',
  Kraken: 'Kraken',
  Leviathan: 'Léviathan',
  Octopus: 'Pieuvre',
  Crab: 'Crabe',
  Treefolk: 'Sylvin',
  Plant: 'Plante',
  Fungus: 'Champignon',
  Saproling: 'Saprolin',
  God: 'Dieu',
  Avatar: 'Avatar',
  Spellshaper: 'Sortemage',
  Shapeshifter: 'Métamorphe',
  Illusion: 'Illusion',
  Specter: 'Spectre',
  Nightmare: 'Cauchemar',
  Imp: 'Diablotin',
  Gargoyle: 'Gargouille',
  Warlock: 'Sorcier',
  Mercenary: 'Mercenaire',
  Noble: 'Noble',
  Advisor: 'Conseiller',
  Artificer: 'Artificier',
  Pilot: 'Pilote',
  Citizen: 'Citoyen',
  Peasant: 'Paysan',
  Minion: 'Sbire',
  Mutant: 'Mutant',
  Ooze: 'Limon',
  Slug: 'Limace',
  Wurm: 'Guivre',
  Drake: 'Drakôn',
  Serpent: 'Serpent',
  Salamander: 'Salamandre',
  Crocodile: 'Crocodile',
  Dinosaur: 'Dinosaure',
  Cyclops: 'Cyclope',
  Minotaur: 'Minotaure',
  Centaur: 'Centaure',
  Satyr: 'Satyre',
  Gorgon: 'Gorgone',
  Harpy: 'Harpie',
  Naga: 'Naga',
  Djinn: 'Djinn',
  Efreet: 'Éfrit',
  Phyrexian: 'phyrexian',
  Eldrazi: 'Eldrazi',
  Praetor: 'Préteur',
  Beeble: 'Beeble',
  Homunculus: 'Homoncule',
}

// Supertype adjectives that move AFTER the type noun in French.
const FR_SUPERTYPE_ADJ = new Set(['de base', 'légendaire', 'des neiges', 'continu'])

/** Translate an English MTG type line to French (best-effort, structure-aware). */
export function translateTypeLine(typeLine: string): string {
  if (!typeLine)
    return ''
  const [left, right] = typeLine.split('—')

  // Left side: supertypes + types. Translate each, then move supertype
  // adjectives after the type noun: "Legendary Creature" → "Créature légendaire".
  const leftWords = (left ?? '').trim().split(/\s+/).filter(Boolean).map(w => TYPE_FR[w] ?? w)
  const adjs = leftWords.filter(w => FR_SUPERTYPE_ADJ.has(w))
  const nouns = leftWords.filter(w => !FR_SUPERTYPE_ADJ.has(w))
  const leftFr = [...nouns, ...adjs].join(' ')

  if (right === undefined)
    return leftFr
  // Right side: subtypes, joined with " et " in French.
  const subs = right.trim().split(/\s+/).filter(Boolean).map(w => TYPE_FR[w] ?? w)
  return `${leftFr} — ${subs.join(' et ')}`.trim()
}

/** Localized type line. Falls back to translating EN when Scryfall lacks FR. */
export function displayType(card: ScryfallCard | null, isFr: boolean, face?: Face | null): string {
  const src = face ?? card
  if (!src)
    return ''
  if (!isFr)
    return (src.type_line ?? src.printed_type_line) ?? ''
  // FR: prefer Scryfall's printed type, else translate the English one.
  if (src.printed_type_line)
    return src.printed_type_line
  return translateTypeLine(src.type_line ?? '')
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
