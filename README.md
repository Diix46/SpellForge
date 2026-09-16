# Spellforge

[![CI](https://github.com/Diix46/SpellForge/actions/workflows/ci.yml/badge.svg)](https://github.com/Diix46/SpellForge/actions/workflows/ci.yml)

> **Deck manager & proxy printer** pour **Magic: The Gathering**.
> Construisez vos decks, importez des listes toutes faites, et imprimez des proxies impeccables en **français ou anglais** sur des feuilles **A4/A3**.

Réécriture moderne (Nuxt 4 + TypeScript) de [MTGProxyPrinter](https://github.com/luziferius/MTGProxyPrinter) (Python/Qt).

Interface **« Premium Dark / Cyber »** : sombre, néons sobres, glassmorphism, fond animé, et un **thème dynamique qui prend la couleur de mana du commander** quand on ouvre un deck.

## Fonctionnalités

### Gestion & deckbuilding
- 📋 **Gestionnaire multi-decks** — créer, dupliquer, renommer, supprimer (sauvegarde locale, aucun compte requis).
- 🛠️ **Deckbuilder intégré** — recherche instantanée dans la **base de cartes locale** (texte, **syntaxe Scryfall** `t:instant cmc<=2`, autocomplétion de noms, thèmes pré-définis « pioche / removal / rampe… », filtres type / sous-type / couleurs / coût / **budget**, tri par popularité-EDHREC / prix / nom / CMC). Un mot-clé non pris en charge est signalé, jamais ignoré.
- 👑 **Filtre « commandants uniquement »** + recherche par défaut au chargement (cartes populaires dans l'identité du commander).
- ✨ **Suggestions EDHREC** — « cartes souvent jouées avec » votre commander, en un clic.
- 📥 **Import** — coller une decklist (formats MTG Arena `4 Lightning Bolt (M10) 146` & texte simple), importer un fichier `.txt`/`.dec`, ou coller une URL **EDHREC** (commander ou *average deck*) ou **Archidekt** (deck public).
- 📤 **Export** — télécharger la decklist en `.txt`, copier dans le presse-papier.

### Affichage & analyse
- 🌐 **Bilingue FR/EN** — sélecteur global qui pilote l'interface **et** la langue des cartes (noms, types, oracle).
- 🇫🇷 **Cartes localisées** — images FR/EN servies par l'application (miroir local des images [Scryfall](https://scryfall.com)), repli automatique sur l'anglais si aucune impression FR ; **type-line traduit** localement quand les données Scryfall n'ont pas la version FR.
- 🔣 **Symboles de mana** — `{T}`, `{W}`, `{W/U}`, `{2}`… rendus en pips dans le coût et l'oracle.
- 👑 **Commander mis en avant** — détecté automatiquement, identité de mana (pips WUBRG), thème de la page coloré selon ses couleurs ; override possible.
- 📊 **Composition interactive** — répartition par type cliquable (filtre la grille), **courbe de mana**, distribution des couleurs, **coût total estimé** du deck.
- 🔍 **Fiche carte** — clic = grand aperçu + nom FR/EN, type, coût, oracle (mots-clés surlignés), édition, prix Cardmarket, liens, flip recto/verso, et **sélecteur d'édition/illustration** (épingle un print précis au deck).

### Impression & achat
- 📄 **Export PDF A4 & A3** — taille réelle (63 × 88 mm), repères de coupe, marges/espacement réglables, aperçu, pagination.
- 🛒 **Onglet Acheter** — coût estimé / moyenne par carte / cartes sans prix, tableau trié par prix, liens de recherche Cardmarket par carte + liste d'envies copiable.

## Stack technique

| Élément | Techno |
|---------|--------|
| Framework | **Nuxt 4** + Vue 3 + TypeScript (`ssr: false`, SPA + routes serveur Nitro) |
| UI | Nuxt UI 4 + Tailwind CSS 4 |
| Design | Système de tokens maison + accent dynamique, `@nuxt/fonts` (Geist / Geist Mono) |
| PDF | jsPDF (génération côté client) |
| Données cartes | Bases SQLite locales, construites depuis le [dump bulk Scryfall](https://scryfall.com/docs/api/bulk-data) (Magic) et punk-records (One Piece) — aucun appel à l'API Scryfall au runtime |
| Base applicative | libSQL (`@libsql/client`) + Drizzle ORM |
| Suggestions / import | [EDHREC](https://edhrec.com) et [Archidekt](https://archidekt.com) (JSON, via route serveur) |
| Lint | [@antfu/eslint-config](https://github.com/antfu/eslint-config) |
| Tests | Vitest (environnement Node) |

## Structure (Nuxt 4)

```
app/                       # code applicatif (srcDir Nuxt 4)
  app.vue                  # shell : header (switch FR/EN), fond animé, footer
  app.config.ts           # couleurs Nuxt UI (neutres)
  assets/css/main.css      # design system : tokens, utilitaires, accent dynamique
  components/
    AppLogo, DeckTile, MtgCardPreview, ExportConsole, CardDetailModal
    builder/               # CardSearchPanel, DeckListPanel
    mana/                  # ManaSymbol, ManaCost
    fx/AppBackground
  composables/
    useMtg                 # noyau partagé : couleurs, classification de type,
                           #   helpers d'affichage localisés, traduction type-line
    useDeckStore           # CRUD decks (localStorage, useState)
    useDecklist            # parse/serialise une decklist
    useDeckBuilder         # couche d'édition raw ↔ structurée + validation EDH
    useCardSearch          # recherche (/api/cards/browse), autocomplete, suggestions
    useScryfall            # résolution d'un deck en une requête (/api/cards/resolve)
    useDeckAnalysis        # stats par type, courbe de mana, prix
    useManaIdentity        # identité couleur, pips, accents
    useCardmarket          # liens d'achat + liste d'envies
    usePdfExport           # mise en page + génération PDF (jsPDF)
    useLocale              # i18n FR/EN
    useAppTheme            # thème global piloté par le deck actif
    useSpotlight, useErrors  # (l'effet tilt est la directive v-tilt, plugins/tilt.client.ts)
  pages/                   # index.vue (dashboard), deck/[id].vue (deck unifié)
server/api/cards/          # browse · resolve · autocomplete · prints · card-image · suggestions (EDHREC)
server/api/images/mtg/     # sert le miroir d'images local, récupère une fois les images manquantes
server/api/                # landing, import, ai, coach, auth, decks, shared ; [...].ts → 404 JSON
server/utils/cards/        # moteur de recherche SQL, analyseur de syntaxe Scryfall, résolution
server/eve/                # coach IA (orchestrateur, spécialistes, outils)
scripts/                   # ingestion et vérification des bases de cartes, miroirs d'images
test/                      # tests Vitest
public/                    # assets statiques
nuxt.config.ts
```

## Notes d'architecture

- **Données cartes locales** : `.data/cards-mtg.db` et `.data/cards-optcg.db`,
  séparées de `.data/spellforge.db` (comptes et decks). Les bases de cartes sont
  reconstruites hors ligne et l'app ne fait que les lire ; une ingestion ne peut
  donc jamais toucher un deck. Détails dans [ARCHITECTURE.md](ARCHITECTURE.md).
- **Recherche** : `/api/cards/browse` reçoit les filtres du panneau et, le cas
  échéant, du texte en syntaxe Scryfall, compilé en SQL côté serveur
  (`server/utils/cards/mtg-syntax.ts`). Un filtre non pris en charge renvoie une
  erreur qui nomme le terme, affichée dans la langue du site.
- **Résolution d'un deck en une requête** : `/api/cards/resolve` choisit
  l'impression à afficher (FR si elle existe, sinon EN) grâce à la table
  `best_printings`, calculée à l'ingestion.
- **Prix** : les impressions FR n'ont presque jamais de prix EUR. Une carte
  affiche le prix de son impression, sinon celui de son impression la moins
  chère ; le filtre budget porte toujours sur l'impression la moins chère.
- **Cache** : les routes de cartes locales ne sont pas mises en cache (requêtes
  indexées). Restent en cache Nitro (sur disque, `.data/cache`) : le visuel de la
  page d'accueil (2 min), les suggestions EDHREC (24 h, **les résultats vides ne
  sont jamais mis en cache**) et la validation de cartes du coach (5 min).
- **EDHREC** n'indexe que les noms **anglais** : les slugs suppriment les
  apostrophes (`Y'shtola, Night's Blessed` → `yshtola-nights-blessed`) et la
  recherche utilise toujours le nom canonique anglais.

## Démarrage

Prérequis : **Node 20+** (développé sous Node 24).

```bash
npm install
npm run cards:ingest      # base Magic (.data/cards-mtg.db) depuis le dump Scryfall
npm run cards:ingest:op   # base One Piece (.data/cards-optcg.db)
npm run dev               # http://localhost:3000
```

L'ingestion Magic télécharge le dump `all_cards` (~375 Mo compressés) et ne
reconstruit la base que s'il a changé (`--force` pour forcer).
`npm run cards:verify` contrôle la base obtenue. Le miroir d'images est
facultatif (`node scripts/mirror-images-mtg.mjs`) : sans lui, chaque image est
récupérée une fois sur le CDN Scryfall puis servie depuis `.data/images`.

Tests :

```bash
npm run test         # Vitest ; les tests d'intégration sont ignorés sans .data/cards-mtg.db
```

### Coach IA (Eve)

Le **Coach IA** (agent Eve) tourne désormais *à l'intérieur* de l'app, en routes
Nitro (`server/eve/*`, exposé via `/api/coach/*`) — pas de service séparé. Il
suffit d'une clé Anthropic dans le `.env` à la racine :

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env      # gitignored
npm run dev
```

Architecture : un **orchestrateur** (boucle tool-use, SDK Anthropic Messages) qui
consulte 6 **spécialistes** (rampe, pioche, removal, courbe, légalité/identité,
budget) et s'appuie sur des outils de données réelles : recherche en syntaxe
Scryfall dans la base locale (l'outil garde le nom `scryfall_search`), EDHREC,
validation d'identité/légalité. Les boutons one-shot (Compléter/Couper/…)
utilisent le même moteur.

## Scripts

| Script | Rôle |
|--------|------|
| `npm run dev` | Serveur de développement (HMR) |
| `npm run build` | Build de production |
| `npm run preview` | Prévisualiser le build |
| `npm run lint` | ESLint (`@antfu/eslint-config`) |
| `npm run lint:fix` | ESLint + corrections automatiques |
| `npm run typecheck` | Vérification de types (`vue-tsc`) |
| `npm run test` | Tests Vitest (`test:watch` en mode surveillance) |
| `npm run cards:ingest` | Construit `.data/cards-mtg.db` depuis le dump Scryfall (`--force` pour reconstruire) |
| `npm run cards:ingest:op` | Construit `.data/cards-optcg.db` |
| `npm run cards:verify` / `cards:verify:op` | Contrôle une base de cartes après ingestion |
| `npm run db:generate` / `db:migrate` | Migrations Drizzle de la base applicative |

## Production

L'app a un **vrai backend** (Nitro + SQLite + sessions Eve en mémoire). Il lui
faut un **serveur Node persistant** — pas un hébergement 100 % statique. Le build
produit `.output/`, un serveur Node autonome :

```bash
npm run build
node .output/server/index.mjs   # écoute sur $NUXT_PORT (défaut 3000)
```

Variables d'environnement (à fournir au runtime, jamais commitées) :

| Variable | Rôle |
|----------|------|
| `ANTHROPIC_API_KEY` | Coach IA (Eve). Sans elle, le chat renvoie 503. |
| `NUXT_SESSION_PASSWORD` | Secret de chiffrement des sessions (≥ 32 caractères). |
| `DATABASE_URL` | Optionnel. Défaut `file:./.data/spellforge.db` (SQLite local). Mettre `libsql://…` + `DATABASE_AUTH_TOKEN` pour Turso. |
| `MTG_CARDS_DB` | Optionnel. Chemin de la base Magic, défaut `.data/cards-mtg.db`. |

Les migrations Drizzle s'appliquent automatiquement au démarrage
(`server/plugins/migrate.ts`). Tout l'état vit dans `./.data` — **à persister**
(volume) : base applicative, bases de cartes, miroir d'images et cache Nitro.
L'image Docker ne contient pas les bases de cartes : elles doivent être
construites (`npm run cards:ingest`, `cards:ingest:op`) et déposées dans ce
volume, sinon la recherche et la résolution des decks ne fonctionnent pas.

### Déploiement Docker (Unraid)

Une image est publiée sur GHCR (`ghcr.io/diix46/spellforge`, image privée) à
chaque release. Les releases sont automatiques : à chaque push sur `main`,
semantic-release lit les messages de commit Conventional Commits, décide de la
version, crée le tag et la release GitHub, puis l'image est construite et
poussée (voir [`.github/workflows/release.yml`](.github/workflows/release.yml)).
Aucun tag manuel.

Sur Unraid (template Docker) :
- **Repository** : `ghcr.io/diix46/spellforge:latest` (registre privé → login GHCR requis)
- **Port** : `3000` (host au choix) → `3000` (container)
- **Volume** : `/mnt/user/appdata/spellforge` → `/app/.data` (bases, images et cache persistants)
- **Variables** : `ANTHROPIC_API_KEY`, `NUXT_SESSION_PASSWORD` (et `DATABASE_URL` si Turso)

## CI / Release

- **CI** ([`ci.yml`](.github/workflows/ci.yml)) : lint + typecheck + build sur chaque pull request vers `main`.
- **Release** ([`release.yml`](.github/workflows/release.yml)) : sur chaque push vers `main`, mêmes vérifications, puis semantic-release et, si une version sort, build + push de l'image Docker vers GHCR.
- Les tests (`npm run test`) ne tournent pas en CI : les lancer en local, après `npm run cards:ingest` pour couvrir la base.

## Crédits & licence

- Données et images de cartes : [Scryfall](https://scryfall.com) (fichiers bulk et CDN d'images, mis en cache localement) — non affilié, non endossé.
- Suggestions & imports : [EDHREC](https://edhrec.com) ; imports : [Archidekt](https://archidekt.com).
- Magic: The Gathering est une marque de Wizards of the Coast. Projet non officiel,
  pour le playtest ; soutenez votre boutique locale.

## Idées pour la suite

- Import depuis Moxfield, MTGGoldfish
- Panier Cardmarket automatique (API partenaire)
- Cache persistant des cartes résolues (localStorage/IndexedDB) entre sessions
- Export/import de la collection de decks (JSON)
- Statistiques avancées (sources de mana, ratio sorts/terrains)
