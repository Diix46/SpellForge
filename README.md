# Prism

[![CI](https://github.com/Diix46/SpellForge/actions/workflows/ci.yml/badge.svg)](https://github.com/Diix46/SpellForge/actions/workflows/ci.yml)

> **L'atelier de decks One Piece et Magic: The Gathering.**
> Construisez un deck entier **sans créer de compte** ; l'inscription ne sert qu'à le garder partout, le partager et le publier.

Deux univers qui ne se ressemblent pas : **One Piece de jour** (papier jauni, affiches WANTED, la mer au pied de la page, « DON!! » à chaque carte ajoutée) et **Magic de nuit** (obsidienne et or, cercle d'invocation, braises). L'accueil est un portail scindé entre les deux.

Toutes les cartes des deux jeux vivent dans des **bases locales** : aucune API de cartes n'est appelée au runtime.

Le projet est né comme réécriture moderne (Nuxt 4 + TypeScript) de [MTGProxyPrinter](https://github.com/luziferius/MTGProxyPrinter) ; le dépôt garde son nom d'origine, SpellForge.

## Fonctionnalités

### One Piece Card Game
- 📚 **Bibliothèque** de toutes les cartes (2 785 numéros, FR quand Bandai les a traduites, EN sinon), filtres catégorie / couleurs / coût / extension / format Standard / counter, fiche avec toutes les illustrations alternatives.
- ⚓ **Atelier de deck** qui applique les règles : un Leader, cinquante cartes, quatre exemplaires par numéro (toutes illustrations confondues), couleurs du Leader, rotation par bloc, cartes et paires bannies ; courbe, counters, triggers.
- 📋 **Decklist texte** compatible simulateurs (`4xOP01-016`, illustration en suffixe `_p1`, Leader en tête).
- 🚫 **Aucune impression** de cartes One Piece.

### Magic: The Gathering
- 📋 **Gestionnaire multi-decks** — créer, dupliquer, renommer, supprimer (sauvegarde locale, aucun compte requis).
- 🛠️ **Deckbuilder intégré** — recherche instantanée dans la **base de cartes locale** (texte, **syntaxe Scryfall** `t:instant cmc<=2`, autocomplétion de noms, thèmes pré-définis « pioche / removal / rampe… », filtres type / sous-type / couleurs / coût / **budget**, tri par popularité-EDHREC / prix / nom / CMC). Un mot-clé non pris en charge est signalé, jamais ignoré.
- 👑 **Filtre « commandants uniquement »** + recherche par défaut au chargement (cartes populaires dans l'identité du commander).
- ✨ **Suggestions EDHREC** — « cartes souvent jouées avec » votre commander, en un clic.
- 📥 **Import** — coller une decklist (formats MTG Arena `4 Lightning Bolt (M10) 146` & texte simple), importer un fichier `.txt`/`.dec`, ou coller une URL **EDHREC** (commander ou *average deck*) ou **Archidekt** (deck public).
- 📤 **Export** — télécharger la decklist en `.txt`, copier dans le presse-papier.
- 📖 **Grimoire** — bibliothèque de toutes les cartes jouables en Commander (31 830), d'où un commandant ouvre un deck.

- 🌐 **Bilingue FR/EN** — sélecteur global qui pilote l'interface **et** la langue des cartes (noms, types, oracle).
- 🇫🇷 **Cartes localisées** — images FR/EN servies par l'application (miroir local des images [Scryfall](https://scryfall.com)), repli automatique sur l'anglais si aucune impression FR ; **type-line traduit** localement quand les données Scryfall n'ont pas la version FR.
- 🔣 **Symboles de mana** — `{T}`, `{W}`, `{W/U}`, `{2}`… rendus en pips dans le coût et l'oracle.
- 👑 **Commander mis en avant** — détecté automatiquement, identité de mana (pips WUBRG), thème de la page coloré selon ses couleurs ; override possible.
- 📊 **Composition interactive** — répartition par type cliquable (filtre la grille), **courbe de mana**, distribution des couleurs, **coût total estimé** du deck.
- 🔍 **Fiche carte** — clic = grand aperçu + nom FR/EN, type, coût, oracle (mots-clés surlignés), édition, prix Cardmarket, liens, flip recto/verso, et **sélecteur d'édition/illustration** (épingle un print précis au deck).

- 📄 **Export PDF A4 & A3** — taille réelle (63 × 88 mm), repères de coupe, marges/espacement réglables, aperçu, pagination.
- 🛒 **Onglet Acheter** — coût estimé / moyenne par carte / cartes sans prix, tableau trié par prix, liens de recherche Cardmarket par carte + liste d'envies copiable.
- 🤖 **Coach IA** (voir plus bas).

### Commun aux deux jeux
- 👤 **Sans compte** : les decks vivent dans le navigateur ; à la connexion ils rejoignent le compte.
- 🔗 **Partage** en lecture seule sous l'univers du deck (`/one-piece/shared/:id`, `/magic/shared/:id`), copie du deck en un clic, galerie publique **Découvrir** filtrable par jeu.
- 🃏 **Une page par carte** (`/one-piece/card/OP01-016`, `/magic/card/Sol%20Ring`), rendue par le serveur et indexable.
- ⌘K **Palette de commandes** qui suit l'univers : cartes du jeu en cours, decks, bibliothèques.
- 🌐 **Bilingue FR/EN** (cookie `prism_locale`, ou `?lang=en` dans un lien).

## Stack technique

| Élément | Techno |
|---------|--------|
| Framework | **Nuxt 4** + Vue 3 + TypeScript, rendu hybride : pages publiques rendues par le serveur, atelier dans le navigateur (`routeRules`) |
| UI | Nuxt UI 4 + Tailwind CSS 4 |
| Design | Tokens redéfinis par univers (`assets/css/universes.css`), `@nuxt/fonts` : Geist, Anton et Bangers (One Piece), Cinzel et EB Garamond (Magic) |
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
    useUniverse, useOptcgDeck, useOptcgSearch, usePublicSeo, useDeckFingerprints
  components/optcg/        # affiches, rail de filtres, fiche carte, panneau de deck
  components/landing/      # portail scindé + sections
  pages/                   # index (tableau de bord), landing, discover,
                           #   one-piece/{index,deck/[id],card/[number],shared/[shareId]}
                           #   magic/{index,deck/[id],card/[name],shared/[shareId]}
shared/                    # code pur des deux côtés : jeux et capacités (game.ts),
                           #   formats de decklist, règles One Piece
server/api/optcg/          # browse · resolve · autocomplete · prints · sets
server/api/images/optcg/   # sert le miroir d'images One Piece (disque uniquement)
server/routes/             # robots.txt, sitemap.xml et sitemaps/{pages,one-piece,magic}.xml
server/tasks/cards/        # tâche planifiée de rafraîchissement des bases de cartes
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
- **Rafraîchissement des cartes** : la tâche Nitro `cards:refresh` tourne chaque
  nuit à 4 h 30. Elle lance, dans des processus enfants (le client libSQL est
  synchrone), l'ingestion One Piece, le miroir de ses images puis l'ingestion
  Magic ; chaque étape a trois essais (1 min puis 5 min d'attente) et une base
  reconstruite sert dès la fin de son étape. Au premier démarrage sans base, la
  tâche part d'elle-même (`CARDS_REFRESH_ON_BOOT=false` pour l'empêcher).
- **Rendu hybride** : `nuxt.config.ts` rend côté serveur l'accueil, les
  bibliothèques, les pages carte, Découvrir et les decks partagés ; tout le
  reste reste une SPA. Une page rendue par le serveur livre une liste de decks
  vide : le plugin `deck-sync` relit les decks invités avant toute écriture. Un
  deck partagé n'est indexé que s'il est listé dans Découvrir.
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
reconstruit la base que s'il a changé (`--force` pour forcer). Les images One
Piece ne sont servies que depuis le disque : `node scripts/mirror-images-optcg.mjs`
les récupère toutes (7 731 visuels FR et EN, ~1,9 Go ; relancer ne télécharge que
les manquants). En développement, `npx nuxi task run cards:refresh` enchaîne les
trois étapes.
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
| `MTG_CARDS_DB` / `OPTCG_CARDS_DB` | Optionnels. Chemins des bases de cartes, défaut `.data/cards-mtg.db` et `.data/cards-optcg.db` (les scripts écrivent toujours dans `.data`). |
| `NUXT_PUBLIC_SITE_URL` | Adresse publique (`https://…`) pour les liens canoniques, les alternates de langue et le sitemap. Vide : l'adresse de la requête. |
| `CARDS_REFRESH_ON_BOOT` | `false` pour ne pas construire les bases de cartes au démarrage quand elles manquent. |

Les migrations Drizzle s'appliquent automatiquement au démarrage
(`server/plugins/migrate.ts`). Tout l'état vit dans `./.data` — **à persister**
(volume) : base applicative, bases de cartes, miroir d'images et cache Nitro.
L'image Docker ne contient pas les bases de cartes : au premier démarrage elle
les construit dans ce volume (quelques minutes pour les bases, bien plus pour le
miroir d'images One Piece), puis les rafraîchit chaque nuit. L'image embarque
pour cela les scripts de `scripts/` et le binaire natif de libSQL, que le build
ne suit pas tout seul.

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
- **Volume** : `/mnt/user/appdata/spellforge` → `/app/.data` (bases, images et cache persistants ; prévoir ~9 Go avec les deux miroirs d'images)
- **Variables** : `ANTHROPIC_API_KEY`, `NUXT_SESSION_PASSWORD`, `NUXT_PUBLIC_SITE_URL` (et `DATABASE_URL` si Turso)

Le nom de l'image et le dossier de données gardent l'ancien nom (`spellforge`) :
les changer casserait les installations existantes.

## CI / Release

- **CI** ([`ci.yml`](.github/workflows/ci.yml)) : lint + typecheck + build sur chaque pull request vers `main`.
- **Release** ([`release.yml`](.github/workflows/release.yml)) : sur chaque push vers `main`, mêmes vérifications, puis semantic-release et, si une version sort, build + push de l'image Docker vers GHCR.
- Les tests (`npm run test`) ne tournent pas en CI : les lancer en local, après `npm run cards:ingest` pour couvrir la base.

## Crédits & licence

- Données et images de cartes : [Scryfall](https://scryfall.com) (fichiers bulk et CDN d'images, mis en cache localement) — non affilié, non endossé.
- Suggestions & imports : [EDHREC](https://edhrec.com) ; imports : [Archidekt](https://archidekt.com).
- Données et images One Piece : [punk-records](https://github.com/buhbbl/punk-records) et le site officiel Bandai, copiées localement ; aucune impression.
- Magic: The Gathering est une marque de Wizards of the Coast. Contenu de fan non officiel, autorisé par la Fan Content Policy ; pour le playtest, soutenez votre boutique locale.
- One Piece Card Game © Eiichiro Oda/Shueisha, Toei Animation, Bandai Namco. Site non officiel, sans lien avec Bandai.

## Idées pour la suite

- Import depuis Moxfield, MTGGoldfish
- Panier Cardmarket automatique (API partenaire)
- Cache persistant des cartes résolues (localStorage/IndexedDB) entre sessions
- Export/import de la collection de decks (JSON)
- Statistiques avancées (sources de mana, ratio sorts/terrains)
