import { computed, ref } from 'vue'

export type Locale = 'fr' | 'en'

const STORAGE_KEY = 'mtg_locale'

// Singleton reactive locale.
const locale = ref<Locale>('fr')
let initialized = false

const messages: Record<Locale, Record<string, string>> = {
  fr: {
    // Header / nav
    'nav.decks': 'Decks',
    'nav.newDeck': 'Nouveau deck',
    'nav.import': 'Importer',
    // Dashboard
    'dash.title': 'Mes Decks',
    'dash.subtitle': 'Gérez vos decklists, importez depuis EDHREC, imprimez des proxies impeccables.',
    'dash.decks': 'decks',
    'dash.cards': 'cartes',
    'dash.lastUpdate': 'maj',
    'dash.empty.title': 'Aucun deck dans le multivers',
    'dash.empty.body': 'Créez un deck en collant une decklist, ou importez un deck tout fait depuis EDHREC.',
    'dash.empty.create': 'Créer un deck',
    'dash.empty.import': 'Importer depuis EDHREC',
    // Tile
    'tile.cards': 'cartes',
    'tile.updated': 'mis à jour',
    'tile.open': 'Ouvrir',
    'tile.rename': 'Renommer',
    'tile.duplicate': 'Dupliquer',
    'tile.delete': 'Supprimer',
    'tile.colorless': 'incolore',
    'source.manual': 'Manuel',
    'source.import': 'Import',
    // Modals
    'modal.newDeck': 'Nouveau deck',
    'modal.deckName': 'Nom du deck',
    'modal.cancel': 'Annuler',
    'modal.create': 'Créer',
    'modal.rename': 'Renommer le deck',
    'modal.save': 'Enregistrer',
    'modal.deleteTitle': 'Supprimer le deck',
    'modal.deleteBody': 'Voulez-vous vraiment supprimer',
    'modal.importDeck': 'Importer un deck',
    'modal.edhrecUrl': 'URL EDHREC',
    'modal.edhrecHelp': 'Collez un lien de commandant ou d\'average deck EDHREC.',
    'modal.examples': 'Exemples supportés',
    'modal.import': 'Importer',
    // Deck editor tabs
    'tab.edit': 'Éditer',
    'tab.preview': 'Aperçu',
    'tab.buy': 'Acheter',
    // Editor
    'editor.decklist': 'Decklist',
    'editor.mainboard': 'mainboard',
    'editor.sideboard': 'sideboard',
    'editor.cardLang': 'Langue des cartes',
    'editor.load': 'Charger',
    'editor.loading': 'Chargement',
    'editor.cardsWord': 'cartes',
    'editor.scryfallNoteFr': 'Images via Scryfall, en français (repli EN si indispo).',
    'editor.scryfallNoteEn': 'Images via Scryfall, en anglais.',
    'editor.noCards': 'Aucune carte chargée.',
    'editor.loadCards': 'Charger les cartes',
    // Commander / stats
    'commander.label': 'Commander',
    'commander.identity': 'identité',
    'commander.details': 'Détails',
    'commander.set': 'Définir comme commander',
    'stats.title': 'Composition',
    'type.creature': 'Créatures',
    'type.instant': 'Éphémères',
    'type.sorcery': 'Rituels',
    'type.artifact': 'Artefacts',
    'type.enchantment': 'Enchantements',
    'type.planeswalker': 'Planeswalkers',
    'type.battle': 'Batailles',
    'type.land': 'Terrains',
    'errors.notFound': 'carte(s) introuvable(s)',
    // Toasts
    'toast.cardsLoaded': 'Cartes chargées',
    'toast.cardsReady': 'cartes prêtes',
    'toast.notFoundCount': 'introuvable(s)',
    'toast.loadError': 'Erreur de chargement',
    'toast.commanderSet': 'Commander défini',
    'toast.loadFirst': 'Chargez d\'abord les cartes',
    'toast.pdfDone': 'PDF généré',
    'toast.exportFailed': 'Export échoué',
    'toast.tooManyCards': 'Trop de cartes',
    'toast.tooManyCardsDesc': 'seules les 15 premières ont été ouvertes. Utilisez la liste d\'envies pour le reste.',
    'toast.listCopied': 'Liste copiée',
    'toast.listCopiedDesc': 'Collez-la dans votre liste d\'envies Cardmarket.',
    // Card modal
    'card.flipBack': 'Voir le verso',
    'card.flipFront': 'Voir le recto',
    'card.priceNa': 'prix indisponible',
    'card.keywords': 'Mots-clés',
    // Export console
    'export.console': 'Console d\'export',
    'export.format': 'Format',
    'export.portrait': 'Portrait',
    'export.landscape': 'Paysage',
    'export.layout': 'Disposition',
    'export.margin': 'Marge',
    'export.spacing': 'Espacement',
    'export.cutGuides': 'Repères de coupe',
    'export.includeBack': 'Inclure dos (double-face)',
    'export.download': 'Télécharger',
    'export.generating': 'Génération…',
    'export.images': 'Images',
    'export.unique': 'uniques',
    'export.inFr': 'en FR',
    'export.pages': 'p',
    // Buy
    'buy.title': 'Acheter sur Cardmarket',
    'buy.uniqueCards': 'cartes uniques',
    'buy.openCards': 'Ouvrir les cartes (max 15)',
    'buy.copyWants': 'Copier la liste d\'envies',
    'buy.openWants': 'Ouvrir Cardmarket Wants',
    // Rarity
    'rarity.common': 'Commune',
    'rarity.uncommon': 'Inhabituelle',
    'rarity.rare': 'Rare',
    'rarity.mythic': 'Mythique',
    'rarity.special': 'Spéciale',
    'rarity.bonus': 'Bonus',
    // Footer
    'footer.tagline': 'Proxies pour playtest — soutenez votre boutique locale.',
    'footer.dataVia': 'Données & images via',
    'footer.importsVia': 'Imports via',
  },
  en: {
    'nav.decks': 'Decks',
    'nav.newDeck': 'New deck',
    'nav.import': 'Import',
    'dash.title': 'My Decks',
    'dash.subtitle': 'Manage your decklists, import from EDHREC, print flawless proxies.',
    'dash.decks': 'decks',
    'dash.cards': 'cards',
    'dash.lastUpdate': 'updated',
    'dash.empty.title': 'No decks in the multiverse',
    'dash.empty.body': 'Create a deck by pasting a decklist, or import a ready-made deck from EDHREC.',
    'dash.empty.create': 'Create deck',
    'dash.empty.import': 'Import from EDHREC',
    'tile.cards': 'cards',
    'tile.updated': 'updated',
    'tile.open': 'Open',
    'tile.rename': 'Rename',
    'tile.duplicate': 'Duplicate',
    'tile.delete': 'Delete',
    'tile.colorless': 'colorless',
    'source.manual': 'Manual',
    'source.import': 'Import',
    'modal.newDeck': 'New deck',
    'modal.deckName': 'Deck name',
    'modal.cancel': 'Cancel',
    'modal.create': 'Create',
    'modal.rename': 'Rename deck',
    'modal.save': 'Save',
    'modal.deleteTitle': 'Delete deck',
    'modal.deleteBody': 'Are you sure you want to delete',
    'modal.importDeck': 'Import a deck',
    'modal.edhrecUrl': 'EDHREC URL',
    'modal.edhrecHelp': 'Paste an EDHREC commander or average-deck link.',
    'modal.examples': 'Supported examples',
    'modal.import': 'Import',
    'tab.edit': 'Edit',
    'tab.preview': 'Preview',
    'tab.buy': 'Buy',
    'editor.decklist': 'Decklist',
    'editor.mainboard': 'mainboard',
    'editor.sideboard': 'sideboard',
    'editor.cardLang': 'Card language',
    'editor.load': 'Load',
    'editor.loading': 'Loading',
    'editor.cardsWord': 'cards',
    'editor.scryfallNoteFr': 'Images via Scryfall, in French (EN fallback if unavailable).',
    'editor.scryfallNoteEn': 'Images via Scryfall, in English.',
    'editor.noCards': 'No cards loaded.',
    'editor.loadCards': 'Load cards',
    'commander.label': 'Commander',
    'commander.identity': 'identity',
    'commander.details': 'Details',
    'commander.set': 'Set as commander',
    'stats.title': 'Composition',
    'type.creature': 'Creatures',
    'type.instant': 'Instants',
    'type.sorcery': 'Sorceries',
    'type.artifact': 'Artifacts',
    'type.enchantment': 'Enchantments',
    'type.planeswalker': 'Planeswalkers',
    'type.battle': 'Battles',
    'type.land': 'Lands',
    'errors.notFound': 'card(s) not found',
    // Toasts
    'toast.cardsLoaded': 'Cards loaded',
    'toast.cardsReady': 'cards ready',
    'toast.notFoundCount': 'not found',
    'toast.loadError': 'Loading error',
    'toast.commanderSet': 'Commander set',
    'toast.loadFirst': 'Load the cards first',
    'toast.pdfDone': 'PDF generated',
    'toast.exportFailed': 'Export failed',
    'toast.tooManyCards': 'Too many cards',
    'toast.tooManyCardsDesc': 'only the first 15 were opened. Use the wants list for the rest.',
    'toast.listCopied': 'List copied',
    'toast.listCopiedDesc': 'Paste it into your Cardmarket wants list.',
    'card.flipBack': 'Show back',
    'card.flipFront': 'Show front',
    'card.priceNa': 'price unavailable',
    'card.keywords': 'Keywords',
    'export.console': 'Export console',
    'export.format': 'Format',
    'export.portrait': 'Portrait',
    'export.landscape': 'Landscape',
    'export.layout': 'Layout',
    'export.margin': 'Margin',
    'export.spacing': 'Spacing',
    'export.cutGuides': 'Cut guides',
    'export.includeBack': 'Include backs (double-faced)',
    'export.download': 'Download',
    'export.generating': 'Generating…',
    'export.images': 'Images',
    'export.unique': 'unique',
    'export.inFr': 'in FR',
    'export.pages': 'p',
    'buy.title': 'Buy on Cardmarket',
    'buy.uniqueCards': 'unique cards',
    'buy.openCards': 'Open cards (max 15)',
    'buy.copyWants': 'Copy wants list',
    'buy.openWants': 'Open Cardmarket Wants',
    'rarity.common': 'Common',
    'rarity.uncommon': 'Uncommon',
    'rarity.rare': 'Rare',
    'rarity.mythic': 'Mythic',
    'rarity.special': 'Special',
    'rarity.bonus': 'Bonus',
    'footer.tagline': 'Proxies for playtesting — support your local game store.',
    'footer.dataVia': 'Data & images via',
    'footer.importsVia': 'Imports via',
  },
}

export function useLocale() {
  if (!initialized && import.meta.client) {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'fr' || saved === 'en')
      locale.value = saved
    initialized = true
  }

  function setLocale(l: Locale) {
    locale.value = l
    if (import.meta.client)
      localStorage.setItem(STORAGE_KEY, l)
  }

  function toggle() {
    setLocale(locale.value === 'fr' ? 'en' : 'fr')
  }

  /** Translate a key. Falls back to the key itself if missing. */
  function t(key: string): string {
    return messages[locale.value][key] ?? messages.fr[key] ?? key
  }

  function rarityLabel(rarity?: string): string {
    if (!rarity)
      return ''
    return t(`rarity.${rarity.toLowerCase()}`) || rarity
  }

  const isFr = computed(() => locale.value === 'fr')

  return { locale, setLocale, toggle, t, rarityLabel, isFr }
}
