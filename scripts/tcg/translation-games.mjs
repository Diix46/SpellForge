/**
 * The games translated unofficially into French (scripts/translate-tcg.mjs):
 * the words each must keep, and what is translated. `onlyMissing`: the game is
 * printed in French, only the cards without any French text are translated,
 * and the official French rows are kept.
 */

/** The game's words, as every translated card must say them. */
const RIFTBOUND_GLOSSARY = {
  'Accelerate': 'Accélération',
  'Action': 'Action',
  'Assault': 'Assaut',
  'Deathknell': 'Glas',
  'Deflect': 'Déviation',
  'Equip': 'Équipement',
  'Ganking': 'Embuscade',
  'Hidden': 'Dissimulé',
  'Legion': 'Légion',
  'Quick-Draw': 'Dégainer',
  'Reaction': 'Réaction',
  'Shield': 'Bouclier',
  'Tank': 'Tank',
  'Temporary': 'Temporaire',
  'Vision': 'Vision',
  'Weaponmaster': 'Maître d\'armes',
  'Unique': 'Unique',
  'Legend': 'Légende',
  'Champion': 'Champion',
  'Chosen Champion': 'Champion choisi',
  'Signature': 'Signature',
  'Battlefield': 'Champ de bataille',
  'Rune': 'Rune',
  'Unit': 'Unité',
  'Spell': 'Sort',
  'Gear': 'Équipement',
  'Token': 'Jeton',
  'Might': 'Puissance',
  'Energy': 'Énergie',
  'Power': 'Essence runique',
  'XP': 'XP',
  'conquer': 'conquérir',
  'hold': 'tenir',
  'Showdown': 'Affrontement',
  'Combat': 'Combat',
  'Recycle': 'Recycler',
  'Channel': 'Canaliser',
  'Exhaust': 'Épuiser',
  'Ready': 'Préparer',
  'Stun': 'Étourdir',
  'Buff': 'Renforcer',
  'Score': 'Score',
  'Victory Score': 'Score de victoire',
  'Base': 'Base',
  'Trash': 'Défausse',
  'Main Deck': 'Deck principal',
  'Rune Deck': 'Deck de runes',
  'Fury': 'Fureur',
  'Calm': 'Calme',
  'Mind': 'Esprit',
  'Body': 'Corps',
  'Chaos': 'Chaos',
  'Order': 'Ordre',
}

const RIFTBOUND_SYSTEM = `Tu traduis des cartes du jeu de cartes Riftbound (League of Legends) de l'anglais vers le français, pour des joueurs francophones.
Règles :
- Traduis TOUJOURS le nom de la carte, comme le ferait la version française de League of Legends. Seuls les noms propres de champions et de lieux de Runeterra restent tels quels (Jinx, Viktor, Piltover, Zaun, Demacia, Bandle…). Exemples : « Bewitching Spirit » → « Esprit ensorceleur » ; « Vi - Piltover Enforcer » → « Vi - Justicière de Piltover » ; « Jinx - Loose Cannon » → « Jinx - Canon déchaîné » ; « Voracious Gromp » → « Gromp vorace ».
- Les mentions de variante entre parenthèses se traduisent aussi : (Alternate Art) → (Illustration alternative), (Overnumbered) → (Hors série), (Signature) → (Signature), (Showcase) → (Vitrine), (Metal) → (Métal).
- Les mots-clés du jeu suivent ce glossaire, toujours, crochets compris (« [Assault 2] » → « [Assaut 2] ») : ${Object.entries(RIFTBOUND_GLOSSARY).map(([en, fr]) => `${en} → ${fr}`).join(' ; ')}.
- Garde tels quels les symboles et marqueurs : [S], [C], [1], [R], :rb_…:, les nombres, les retours à la ligne.
- Le texte de règles est précis et impersonnel comme sur une carte française de jeu (« Quand vous jouez cette carte, piochez 1. ») ; le texte d'ambiance garde sa voix.
Réponds uniquement par un tableau JSON, un objet par carte dans l'ordre reçu : {"id": …, "name": …, "text": …, "flavour": …} (text et flavour à null quand la carte n'en a pas).`

/** Yu-Gi-Oh!'s words, as Konami prints them on its French cards. */
const YUGIOH_GLOSSARY = {
  'Special Summon': 'Invocation Spéciale',
  'Normal Summon': 'Invocation Normale',
  'Tribute Summon': 'Invocation Sacrifice',
  'Fusion Summon': 'Invocation Fusion',
  'Synchro Summon': 'Invocation Synchro',
  'Xyz Summon': 'Invocation Xyz',
  'Link Summon': 'Invocation Lien',
  'Ritual Summon': 'Invocation Rituelle',
  'Pendulum Summon': 'Invocation Pendule',
  'Graveyard': 'Cimetière',
  'GY': 'Cimetière',
  'banish': 'bannir',
  'Deck': 'Deck',
  'Extra Deck': 'Extra Deck',
  'hand': 'main',
  'field': 'Terrain',
  'Monster Zone': 'Zone Monstre',
  'Spell & Trap Zone': 'Zone Magie & Piège',
  'Field Zone': 'Zone Terrain',
  'Spell Card': 'Carte Magie',
  'Trap Card': 'Carte Piège',
  'Quick-Play Spell': 'Magie Jeu-Rapide',
  'Continuous': 'Continue',
  'Counter Trap': 'Piège-Contre',
  'Equip Spell': 'Magie d\'Équipement',
  'Field Spell': 'Magie de Terrain',
  'Tuner': 'Syntoniseur',
  'material': 'Matériel',
  'Xyz Material': 'Matériel Xyz',
  'Link Rating': 'Classe Lien',
  'Level': 'Niveau',
  'Rank': 'Rang',
  'ATK': 'ATK',
  'DEF': 'DEF',
  'LP': 'LP',
  'Battle Phase': 'Battle Phase',
  'Main Phase': 'Main Phase',
  'Standby Phase': 'Standby Phase',
  'End Phase': 'End Phase',
  'Draw Phase': 'Draw Phase',
  'Chain': 'Chaîne',
  'activate': 'activer',
  'negate': 'annuler',
  'destroy': 'détruire',
  'target': 'cibler',
  'face-up': 'face recto',
  'face-down': 'face verso',
  'Set': 'Poser',
  'Attack Position': 'Position d\'Attaque',
  'Defense Position': 'Position de Défense',
  'once per turn': 'une fois par tour',
  'You can only use this effect of': 'Vous ne pouvez utiliser cet effet de',
  'DARK': 'TÉNÈBRES',
  'LIGHT': 'LUMIÈRE',
  'EARTH': 'TERRE',
  'WATER': 'EAU',
  'FIRE': 'FEU',
  'WIND': 'VENT',
  'DIVINE': 'DIVIN',
  'Dragon': 'Dragon',
  'Spellcaster': 'Magicien',
  'Warrior': 'Guerrier',
  'Machine': 'Machine',
  'Fiend': 'Démon',
  'Beast': 'Bête',
  'Beast-Warrior': 'Bête-Guerrier',
  'Winged Beast': 'Bête Ailée',
  'Zombie': 'Zombie',
  'Fairy': 'Elfe',
  'Insect': 'Insecte',
  'Aqua': 'Aqua',
  'Pyro': 'Pyro',
  'Rock': 'Rocher',
  'Plant': 'Plante',
  'Thunder': 'Tonnerre',
  'Sea Serpent': 'Serpent de Mer',
  'Reptile': 'Reptile',
  'Psychic': 'Psychique',
  'Wyrm': 'Wyrm',
  'Cyberse': 'Cyberse',
  'Illusion': 'Illusion',
}

const YUGIOH_SYSTEM = `Tu traduis des cartes du jeu de cartes Yu-Gi-Oh! de l'anglais vers le français, comme Konami les imprime en français.
Règles :
- Traduis le nom de la carte comme le ferait la version française officielle. Les noms d'archétypes établis gardent leur forme française connue (« Blue-Eyes » → « Yeux Bleus », « Dark Magician » → « Magicien Sombre », « Red-Eyes » → « Yeux Rouges ») ; un archétype sans nom français connu reste en anglais.
- Le texte d'effet suit la rédaction PSCT française officielle (« Vous pouvez… », « Si cette carte est… », « Vous ne pouvez utiliser cet effet de "Nom" qu'une fois par tour. »). Les noms de cartes cités entre guillemets sont traduits de la même façon que les noms.
- Les mots du jeu suivent ce glossaire : ${Object.entries(YUGIOH_GLOSSARY).map(([en, fr]) => `${en} → ${fr}`).join(' ; ')}.
- Garde tels quels les nombres, les retours à la ligne et les puces (●).
- Le texte d'un monstre Normal (sans effet) est une description : garde sa voix.
Réponds uniquement par un tableau JSON, un objet par carte dans l'ordre reçu : {"id": …, "name": …, "text": …, "flavour": …} (text et flavour à null quand la carte n'en a pas).`

export const TRANSLATED_GAMES = {
  riftbound: { label: 'Riftbound', glossary: RIFTBOUND_GLOSSARY, system: RIFTBOUND_SYSTEM, onlyMissing: false },
  yugioh: { label: 'Yu-Gi-Oh!', glossary: YUGIOH_GLOSSARY, system: YUGIOH_SYSTEM, onlyMissing: true },
}
