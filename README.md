# Spellforge

> **Deck manager & proxy printer** pour **Magic: The Gathering**.
> Gérez vos decklists, importez des decks tout faits, et imprimez des proxies impeccables en **français ou anglais** sur des feuilles **A4/A3**.

Réécriture moderne (Nuxt 4 + TypeScript) de [MTGProxyPrinter](https://github.com/luziferius/MTGProxyPrinter) (Python/Qt).

Interface **« Premium Dark / Cyber »** : sombre, néons sobres, glassmorphism, fond animé, et un **thème dynamique qui prend la couleur de mana du commander** quand on ouvre un deck.

## Fonctionnalités

- 📋 **Gestionnaire multi-decks** — créer, dupliquer, renommer, supprimer (sauvegarde locale).
- 🃏 **Coller une decklist** — formats MTG Arena (`4 Lightning Bolt (M10) 146`) et texte simple.
- 🌐 **Bilingue FR/EN** — sélecteur de langue global qui pilote l'interface **et** la langue des cartes.
- 🇫🇷 **Cartes en français ou anglais** — images via [Scryfall](https://scryfall.com), repli automatique vers l'anglais si aucune version FR imprimable.
- 👑 **Commander mis en avant** — détecté automatiquement, thème de la page coloré selon son identité de mana, override possible.
- 🔍 **Détails de carte** — clic = zoom + nom FR/EN, type, coût de mana, texte d'oracle (mots-clés surlignés), édition, prix Cardmarket, liens, flip recto/verso.
- 📊 **Statistiques** — répartition par type (créatures, éphémères, rituels, terrains…).
- 📄 **Export PDF A4 et A3** — taille réelle des cartes (63 × 88 mm), repères de coupe, marges/espacement réglables, pagination.
- 🔄 **Import EDHREC** — collez l'URL d'un commandant ou d'un *average deck*.
- 🛒 **Achat Cardmarket** — liens de recherche par carte + liste d'envies copiable.

## Stack technique

| Élément | Techno |
|---------|--------|
| Framework | Nuxt 4 + Vue 3 + TypeScript |
| UI | Nuxt UI 4 + Tailwind CSS 4 |
| Design | Système de tokens maison + accent dynamique, `@nuxt/fonts` (Orbitron / Sora / JetBrains Mono) |
| PDF | jsPDF (génération côté client) |
| Données cartes | Scryfall API |
| Import decks | EDHREC (via route serveur Nitro) |

## Structure (Nuxt 4)

```
app/                  # code applicatif (srcDir Nuxt 4)
  app.vue             # shell : header (switch FR/EN), fond animé, footer
  app.config.ts       # couleurs Nuxt UI (neutres)
  assets/css/main.css # design system : tokens, utilitaires, accent dynamique
  components/         # AppLogo, DeckTile, MtgCardPreview, ExportConsole, CardDetailModal, fx/AppBackground
  composables/        # useDeckStore, useDecklist, useScryfall, usePdfExport, useCardmarket,
                      # useManaIdentity, useDeckAnalysis, useLocale, useTilt, useSpotlight
  pages/              # index.vue (dashboard), deck/[id].vue (éditeur)
server/api/           # import.post.ts (EDHREC), proxy-image.get.ts (CORS Scryfall)
public/               # assets statiques
nuxt.config.ts
```

## Démarrage

```bash
npm install
npm run dev          # http://localhost:3000
```

## Production

```bash
npm run build
npm run preview
```

Déployable sur Vercel/Netlify (preset Nitro automatique).

## Idées pour la suite

- Prix total estimé du deck en temps réel
- Import depuis Moxfield, Archidekt, MTGGoldfish
- Panier Cardmarket automatique (API partenaire)
- Courbe de mana & statistiques avancées
- Export/import de la collection de decks (JSON)
- Choix de l'édition/illustration par carte
