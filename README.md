# Spellforge

[![CI](https://github.com/Diix46/SpellForge/actions/workflows/ci.yml/badge.svg)](https://github.com/Diix46/SpellForge/actions/workflows/ci.yml)

> **Deck manager & proxy printer** pour **Magic: The Gathering**.
> Construisez vos decks, importez des listes toutes faites, et imprimez des proxies impeccables en **français ou anglais** sur des feuilles **A4/A3**.

Réécriture moderne (Nuxt 4 + TypeScript) de [MTGProxyPrinter](https://github.com/luziferius/MTGProxyPrinter) (Python/Qt).

Interface **« Premium Dark / Cyber »** : sombre, néons sobres, glassmorphism, fond animé, et un **thème dynamique qui prend la couleur de mana du commander** quand on ouvre un deck.

## Fonctionnalités

### Gestion & deckbuilding
- 📋 **Gestionnaire multi-decks** — créer, dupliquer, renommer, supprimer (sauvegarde locale, aucun compte requis).
- 🛠️ **Deckbuilder intégré** — recherche **Scryfall en direct** (texte, autocomplétion de noms, thèmes pré-définis « pioche / removal / rampe… », filtres type / sous-type / couleurs / coût / **budget**, tri par popularité-EDHREC / prix / nom / CMC).
- 👑 **Filtre « commandants uniquement »** + recherche par défaut au chargement (cartes populaires dans l'identité du commander).
- ✨ **Suggestions EDHREC** — « cartes souvent jouées avec » votre commander, en un clic.
- 📥 **Import** — coller une decklist (formats MTG Arena `4 Lightning Bolt (M10) 146` & texte simple), importer un fichier `.txt`/`.dec`, ou coller une URL **EDHREC** (commander ou *average deck*).
- 📤 **Export** — télécharger la decklist en `.txt`, copier dans le presse-papier.

### Affichage & analyse
- 🌐 **Bilingue FR/EN** — sélecteur global qui pilote l'interface **et** la langue des cartes (noms, types, oracle).
- 🇫🇷 **Cartes localisées** — images FR/EN via [Scryfall](https://scryfall.com), repli automatique si aucune impression FR ; **type-line traduit** localement quand Scryfall ne fournit pas la version FR.
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
| Design | Système de tokens maison + accent dynamique, `@nuxt/fonts` (Orbitron / Sora / JetBrains Mono) |
| PDF | jsPDF (génération côté client) |
| Données cartes | [Scryfall API](https://scryfall.com/docs/api) |
| Suggestions / import | [EDHREC](https://edhrec.com) (JSON, via route serveur) |
| Lint | [@antfu/eslint-config](https://github.com/antfu/eslint-config) |

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
    useCardSearch          # requêtes Scryfall, autocomplete, suggestions
    useScryfall            # résolution collection + impressions FR (bulk)
    useDeckAnalysis        # stats par type, courbe de mana, prix
    useManaIdentity        # identité couleur, pips, accents
    useCardmarket          # liens d'achat + liste d'envies
    usePdfExport           # mise en page + génération PDF (jsPDF)
    useLocale              # i18n FR/EN
    useAppTheme            # thème global piloté par le deck actif
    useTilt, useSpotlight, useErrors
  pages/                   # index.vue (dashboard), deck/[id].vue (deck unifié)
server/api/cards/          # search · autocomplete · suggestions · prints  (proxys Scryfall/EDHREC, cachés)
server/api/                # proxy-image.get.ts (contourne le CORS des images Scryfall)
public/                    # assets statiques
nuxt.config.ts
```

## Notes d'architecture

- **Routes serveur cachées** (`defineCachedEventHandler` / `defineCachedFunction`) :
  recherche (60 s + stale-while-revalidate 24 h), autocomplétion (1 h),
  suggestions EDHREC (24 h, **les résultats vides ne sont jamais mis en cache**),
  images proxy (7 j). Les recherches identiques sont instantanées et on reste
  sous la limite de débit de Scryfall.
- **Résolution FR groupée** : pour un deck FR, une seule requête `/cards/search`
  par lot de ~40 noms pré-charge les impressions françaises (évite le N+1).
- **Prix FR** : les impressions FR n'ayant presque jamais de prix EUR sur
  Scryfall, le prix de l'impression par défaut (EN) est récupéré et fusionné.
- **EDHREC** n'indexe que les noms **anglais** : les slugs suppriment les
  apostrophes (`Y'shtola, Night's Blessed` → `yshtola-nights-blessed`) et la
  recherche utilise toujours le nom canonique anglais.

## Démarrage

Prérequis : **Node 20+** (développé sous Node 24).

```bash
npm install
npm run dev          # http://localhost:3000
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
budget) et s'appuie sur des outils de données réelles (Scryfall, EDHREC,
validation d'identité/légalité). Les boutons one-shot (Compléter/Couper/…)
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

Les migrations Drizzle s'appliquent automatiquement au démarrage
(`server/plugins/migrate.ts`). La base SQLite + le cache vivent dans `./.data` —
**à persister** (volume).

### Déploiement Docker (Unraid)

Une image est publiée sur GHCR à chaque tag de version (voir
[`.github/workflows/release.yml`](.github/workflows/release.yml)) :

```bash
# Cut a release: tag + push → GitHub Actions build & push ghcr.io/diix46/spellforge
git tag v1.0.0 && git push origin v1.0.0
# → ghcr.io/diix46/spellforge:1.0.0, :1.0, :1, :latest (image privée)
```

Sur Unraid (template Docker) :
- **Repository** : `ghcr.io/diix46/spellforge:latest` (registre privé → login GHCR requis)
- **Port** : `3000` (host au choix) → `3000` (container)
- **Volume** : `/mnt/user/appdata/spellforge` → `/app/.data` (DB + cache persistants)
- **Variables** : `ANTHROPIC_API_KEY`, `NUXT_SESSION_PASSWORD` (et `DATABASE_URL` si Turso)

## CI / Release

- **CI** ([`ci.yml`](.github/workflows/ci.yml)) : lint + typecheck + build sur chaque `push`/`pull_request` vers `main`.
- **Release** ([`release.yml`](.github/workflows/release.yml)) : build + push de l'image Docker vers GHCR sur chaque tag `v*`.

## Crédits & licence

- Données et images de cartes : [Scryfall](https://scryfall.com) — non affilié, non endossé.
- Suggestions & imports : [EDHREC](https://edhrec.com).
- Magic: The Gathering est une marque de Wizards of the Coast. Projet non officiel,
  pour le playtest ; soutenez votre boutique locale.

## Idées pour la suite

- Import depuis Moxfield, Archidekt, MTGGoldfish
- Panier Cardmarket automatique (API partenaire)
- Cache persistant des cartes résolues (localStorage/IndexedDB) entre sessions
- Export/import de la collection de decks (JSON)
- Statistiques avancées (sources de mana, ratio sorts/terrains)
