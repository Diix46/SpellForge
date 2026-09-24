# Plan — Prism : multi-univers & données locales

> Statut : **validé le 16/09/2026, lots 0 à 9 livrés le même jour** (bilan au §6,
> arbitrages au §6 ter). Tous les chiffres ci-dessous sont **mesurés**, pas estimés
> (téléchargements réels des dumps Scryfall, base SQLite réellement construite,
> `Content-Length` réels sur le CDN, probes FTS5 contre `@libsql/client` du projet).

---

## 1. Décisions actées

| Sujet | Décision |
|---|---|
| Marque | Rebrand neutre complet → **Prism** (à confirmer : domaine, antériorité) |
| Périmètre | Magic **+** One Piece Card Game, extensible à un 3ᵉ jeu |
| One Piece | Bibliothèque + deckbuilding. **Jamais de proxy, jamais d'export imprimable** |
| Données cartes | **Zéro dépendance API au runtime.** Tout en base locale |
| Déploiement | L'app tourne sur **192.168.1.2** (Docker + volume nommé) |
| Images One Piece | **Miroir complet FR et EN local** (7 731 visuels, ~1,9 Go ; décision révisée, cf. §6 ter) |
| Direction visuelle | Deux mondes opposés : One Piece de jour sur papier, Magic de nuit sur obsidienne |

Maquette de référence : https://claude.ai/artifact/4xdKcaNZMmijH8ExhSv3cp

---

## 2. Chiffres de référence (mesurés le 16/09/2026)

### Données

| Élément | Valeur réelle |
|---|---|
| Dump `all_cards` Scryfall | 375 Mo gzip → **2,70 Gio** décompressé → **542 326 lignes** |
| Après filtre `lang IN ('en','fr')` | **174 228 lignes** (115 381 EN + 58 847 FR) |
| Base SQLite finale (lean + FTS5) | **239 Mio** — seed gzippé **56 Mio** |
| Temps d'ingestion complet | **19 s** (download + gunzip + parse + insert + index + VACUUM) |
| Latence d'une requête type | **21 ms** (commandants FR, cmc ≤ 4, tri EDHREC) |
| One Piece FR | **2 888 cartes**, 1,7 Mo JSON, 37 packs |

### Images

| Élément | Volume |
|---|---|
| Magic `normal` (488×680), EN+FR | **≈ 13,5 Gio** |
| Magic `small` (146×204), EN+FR | ≈ 2,2 Gio |
| One Piece FR (WebP, 92,3 Ko moy.) | **≈ 260 Mio** |
| **Total miroir complet** | **≈ 16 Gio** |

> **Le budget annoncé était 1 To. Le besoin réel est ~16 Gio — 60× moins.**
> Le téraoctet n'apparaît que si on mirore les PNG haute résolution de Scryfall
> (553 Gio à eux seuls), ce dont personne n'a besoin pour afficher une grille.

---

## 3. Architecture cible

```
┌─ Ingestion (tâche Nitro planifiée, hors chemin de requête) ─────────┐
│  Scryfall  /bulk-data (3,4 Ko)  → compare updated_at                │
│      └─ si changé : stream jsonl_download_uri                       │
│            fetch → gunzip → readline → JSON.parse → INSERT batché   │
│            → cards-new.db → rename() atomique → reopen              │
│  punk-records (JSON statique, maj hebdo) → même pipeline pour OP    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─ SQLite / libSQL  (volume nommé, disque local, WAL) ────────────────┐
│  oracle_cards · printings · card_faces · card_parts · card_search   │
│  + op_cards · op_packs                                              │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─ CardProvider (interface) ──────────────────────────────────────────┐
│  mtgProvider          │  optcgProvider                              │
│  search / resolve / prints / rules / palette / marketplace          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                    app/ (inchangée dans sa structure)
```

**Ce qui disparaît** : `server/utils/scryfall.ts`, les 8 routes `server/api/cards/*`
qui proxient Scryfall, `enrichFrenchPrices`, `bulkPrefetchFrench`,
`bulkPrefetchLocalized`, `searchFrenchByName`, `searchBestPrinting`.

**Le gain principal** : la résolution d'une carte en français passe de **5 appels
réseau en cascade** à **une requête indexée**.

```sql
WHERE oracle_id = ? AND lang = 'fr' AND is_real_image = 1
ORDER BY (image_status = 'highres_scan') DESC, released_at DESC LIMIT 1
```

---

## 4. Schéma

Validé techniquement contre `@libsql/client` du projet : **FTS5 avec
`unicode61 remove_diacritics 2`**, **JSON1**, **colonnes générées indexables** et
**WAL** sont tous disponibles. Aucun moteur de recherche externe nécessaire.

```
oracle_cards          oracle_id PK · name · name_folded · name_front · type_line
                      oracle_text · mana_cost · cmc · layout · keywords
                      colors_mask INT · color_identity_mask INT      ← 5 bits WUBRG
                      legal_commander · is_funny · is_commander · edhrec_rank
                      min_price_eur                                  ← rollup, cf. §5.4
                      INDEX (name_folded) (cmc, edhrec_rank) (color_identity_mask)

printings             id PK · oracle_id → · lang · set · collector_number
                      released_at · rarity · promo · image_status · is_real_image
                      printed_name · printed_type_line · printed_text
                      price_eur · image_updated_at                   ← pas d'URL, cf. §5.8
                      UNIQUE (set, collector_number, lang)
                      INDEX (oracle_id, lang, is_real_image, image_status)

card_faces            (printing_id, face_index) PK — faces 0 et 1 uniquement
card_parts            oracle_id · component='token' · related_name
card_search           FTS5 : name_folded, printed_name, oracle_text, printed_text

op_cards              id PK · card_number · name · category · colors · rarity
                      pack_id · set_code · block_number · cost · life · power
                      counter · attributes · types · effect · trigger · lang
op_packs              id PK · label · lang
```

**Masques de couleur** : `id<=WUBRG` (sous-ensemble) devient `mask & ~q = 0`,
`color>=` (sur-ensemble) devient `mask & q = q`. Deux tests entiers indexés au lieu
de comparaisons de chaînes — c'est la requête la plus chaude de l'app.

---

## 5. Les pièges identifiés (chacun coûte une journée si découvert tard)

1. **L'API bulk a changé en juillet 2026.** `download_uri` et `size` **n'existent
   plus** ; ce sont `jsonl_download_uri` et `compressed_size`, et les fichiers sont
   du **JSONL gzippé**, pas un tableau JSON. Toute doc ou tout exemple antérieur est
   mort. Bonne nouvelle : le streaming devient trivial (une ligne = un objet).
2. **`default_cards` ne contient que 430 cartes françaises** (celles sans version
   anglaise). Il faut impérativement `all_cards` — 58 847 impressions FR.
3. **`is:commander` n'est récupérable qu'à 90,7 %** (3 384 dérivés vs 3 730 réels).
   Les Backgrounds et variantes *partner* manquent → liste d'exceptions à maintenir,
   avec un test épinglé sur les comptes Scryfall.
4. **Les prix EUR sont absents de 98 % des impressions FR** (1 105 / 58 847). Filtrer
   sur le prix de la ligne française viderait le catalogue. Il faut un rollup
   `min(price_eur)` par `oracle_id` → couverture 99,8 %.
5. **`ORDER BY edhrec_rank` met les NULL en premier** en SQLite ASC — mais le
   correctif évident, `ORDER BY edhrec_rank IS NULL, edhrec_rank`, **est un piège** :
   une expression en tête d'`ORDER BY` neutralise tout index. Il a coûté 66 ms sur
   la navigation par défaut. La bonne réponse est une colonne sentinelle
   (`edhrec_sort`, NULL → valeur haute) calculée à l'ingestion.
6. **Plusieurs impressions FR partagent un `oracle_id`** → `GROUP BY oracle_id`,
   sinon la même carte apparaît trois fois. C'est exactement `unique=cards` vs
   `unique=prints` : il faut exposer le même choix.
7. **Scryfall masque par défaut** memorabilia, funny, art_series, tokens. Sans
   reproduire ces exclusions, nos compteurs divergeront visiblement des siens.
8. **Ne jamais stocker les URLs d'images** : elles se dérivent de `id` +
   `image_updated_at`. Les stocker coûte **400 Mio**, soit 62 % de la base.
9. **SQLite en WAL sur bind mount macOS ou NFS = corruption.** Volume Docker
   **nommé, sur disque local**, non négociable — y compris en dev.
10. **Ne jamais `fs.copyFile()` une base WAL ouverte.** `VACUUM INTO` pour les
    snapshots.
11. **Le `oracle_text` des dumps contient le texte de rappel** (« Cycling {2}
    ({2}, Discard this card: Draw a card.) »), alors que `oracle:` chez Scryfall
    l'ignore. L'indexer tel quel faisait remonter 582 cartes de trop dans le
    thème « pioche » (+22 %). L'index de recherche est construit sans lui.
12. **Un pipe masque le code de sortie** : `npm run x | tail` renvoie celui de
    `tail`. Une ingestion en échec a ainsi été rapportée comme réussie — deux
    fois. Toujours capturer `$?` sans pipe sur une étape qui compte.
13. **Le JSON d'un appel d'outil décode `\uXXXX`** : écrit dans du code source,
    il devient un caractère littéral, parfois invisible. Construire ces valeurs
    par `String.fromCharCode` plutôt que les écrire en échappement.

---

## 6. Lots de travail

Ordonnés pour que **chaque lot soit livrable et testable seul**, et que le
comportement observable ne change qu'au lot 4.

| # | Lot | Contenu | Sortie attendue |
|---|---|---|---|
| **0** ✔ | Assainissement — **fait** | jspdf 2.5.2→**4.2.1** (sécurité, cf. §8 bis), `@nuxt/ui` 4.8.2→**4.11.1**, `npm audit fix`, Renovate `pnpmDedupe`→`npmDedupe`, Dockerfile node:20→**24**, purge des 3 polices inutilisées | ✔ lint 0 · typecheck 0 · build 0 · **`npm audit --omit=dev` : 0 vulnérabilité** · build 4,32 → **4,07 Mo** |
| **1** ✔ | Ingestion MTG **et** One Piece + tests | Streaming JSONL, schéma, index, FTS5, échange atomique, **une base par jeu**, nouvelles tentatives réseau (3 essais), `ANALYZE`. Vitest en place. Tâche Nitro `cards:refresh` planifiée chaque nuit (processus enfants, 3 essais par étape, réouverture des bases), construction au premier démarrage | ✔ MTG **168 Mo en 88 s** (38 794 cartes / 174 237 impressions) · OP **6,7 Mo en 5 s** (2 888 FR + 4 843 EN) · base de recherche = **31 830 cartes, exactement `legal:commander -is:funny`** · `npm run test` : **107/107** (61 passent et 46 sont ignorés sur un clone sans base) · version de schéma : une base plus ancienne est reconstruite d'office |
| **2** ✔ | Moteur de recherche — **fait** | `server/utils/cards/mtg-query.ts` : thèmes en FTS5, masques de couleur, budget, identité, tris, pagination, épinglage, autocomplétion | ✔ **3,4 ms** sur la navigation par défaut (168 → 66 → 3,4), page 20 à **3,6 ms** (109), résultats justes en VF · plan d'exécution sans `SCAN bp` ni tri du jeu complet |
| **3** ✔ | `GameCard` — **fait** ; `CardProvider` — **abandonné** (cf. §6 ter) | `ResolvedCard.card` devient une union discriminée par jeu ; `mtgRaw()` oblige chaque appel spécifique à Magic à se déclarer | ✔ typecheck **42 → 0** · 23 tests (dont le repli du type-line sur la face avant) · bundle **inchangé à 4,07 Mo** |
| **4** ✔ | Bascule — **faite**, cf. §6 bis | La base locale sert l'app ; suppression des proxies Scryfall | ✔ **zéro appel à l'API Scryfall au runtime** · proxies de recherche et d'images supprimés · syntaxe Scryfall compilée en local |
| **5** ✔ | Images — **fait** | Miroir OP complet (FR + repli EN) ; miroir Magic `small` + `normal` des seules impressions affichables ; une route locale sert le miroir et récupère une seule fois le reste (`large`, `png`) | ✔ OP **4 374 visuels, 801 Mo** · Magic **134 226 fichiers, 6,36 Go, 19 min, 0 échec** · `large` : **217 ms** à la 1re demande, **1,5 ms** ensuite |
| **6** ✔ | Adaptateur One Piece — **fait** (base enrichie, règles, recherche, résolution, images, bibliothèque, atelier) | Ingestion punk-records, moteur de règles OPTCG (50 + leader, 4 max par numéro, couleurs ⊆ leader, rotation par bloc, paires bannies) | ✔ Un deck OP se construit et se valide : 50/50 « légal Standard » vérifié à l'écran |
| **7** ✔ | UI multi-univers — **faite** | Colonne `game`, migration `localStorage` v2, rail de filtres, thèmes par univers (jetons, polices, décors, curseurs, effets d'ajout), tableau de bord par monde, portail d'accueil scindé, partage et Découvrir par univers, palette ⌘K par univers, garde d'impression PDF | ✔ La maquette devient l'application, vérifiée dans Chrome (Windows) |
| **8** ✔ | SEO — **fait** | Rendu hybride sur les pages publiques (accueil, bibliothèques, pages carte, `/discover`, decks partagés), langue en cookie + `?lang=`, canonique, hreflang, Open Graph, robots, sitemap (3 fichiers, 34 615 cartes) | ✔ `/one-piece/card/OP01-016` et `/magic/card/Sol%20Ring` rendues par le serveur (titre, h1, canonique) ; carte inconnue → 404 `noindex` |
| **9** ✔ | Rebrand — **fait** | Prism : nom, logo à deux facettes (rouge One Piece, or Magic), favicon, copies sans tirets longs, métadonnées localisées | Dépôt, image GHCR et `.data/spellforge.db` gardent l'ancien nom (compatibilité) |

Le lot 3 est le verrou : **tant que `ResolvedCard` transporte le JSON brut de
Scryfall dans 25 fichiers, aucun second jeu n'est possible.**

---

## 6 bis. Découpage du lot 4 (la bascule)

**Remplacer `/api/cards/search` en place casserait l'app en silence.** Cette route a
une demi-douzaine d'appelants qui envoient tous de la syntaxe Scryfall brute
(passage direct pour utilisateurs avancés, suggestions EDHREC en noms exacts,
pré-chargement FR, jetons, page d'accueil, coach), et ses résultats circulent dans
l'app **sous forme de JSON Scryfall brut** (`SearchResultCard`, `openSearchDetail`,
`addSearchCard`, jetons via `all_parts`).

**Stratégie : reconstruire la forme Scryfall à partir de la base locale.** La base
contient tout ce que l'app consomme, ou de quoi le recalculer (couleurs depuis les
masques, URL d'images depuis `id` + version). Le backend devient un remplacement
transparent ; le client ne bouge pas. Les appelants en syntaxe brute restent sur
l'ancien proxy le temps d'être migrés un par un, au lieu de se dégrader sans bruit.

| Étape | Contenu | Gain visible |
|---|---|---|
| **4a** ✔ | Route d'images locale (repli vers le CDN Scryfall pour ce qui n'est pas miroré) + reconstruction de la forme Scryfall | 10 tests prouvent que la forme reconstruite passe dans les propres helpers de l'app |
| **4b** ✔ | `/api/cards/resolve` : toute la cascade de résolution (collection + VF + meilleure impression) en **une** requête côté serveur | Deck Commander de 100 cartes résolu en **~6 ms** en HTTP, 100/100 en VF — contre jusqu'à 5 appels réseau **par carte** |
| **4c** ✔ | `/api/cards/browse` à filtres structurés ; `useCardSearch.search()` quitte la chaîne Scryfall ; suggestions EDHREC via `resolve` | **~30 ms** en HTTP · top 5 identique à Scryfall sur 4 combinaisons, totaux à ±3,4 % · la syntaxe brute reste sur Scryfall jusqu'à 4d |
| **4d** ✔ | Migration des derniers appelants, puis suppression des proxies. Suggestions, jetons, autocomplétion, validation IA, éditions, image du coach, page d'accueil ; puis **l'analyseur de syntaxe** (`mtg-syntax.ts`), qui sert la recherche avancée **et** l'outil `scryfall_search` du coach ; 404 pour toute API inconnue | ✔ **Zéro appel Scryfall au runtime** · 44 requêtes comparées à Scryfall : **31 identiques, les autres à moins de 3 %, −0,45 % au total** · **médiane 36 ms, max 80 ms** en HTTP |

Tailles d'images : `small` et `normal` sont mirorées ; `large` et `png` (fiche détail,
export PDF) sont récupérées une fois par la route d'images locale, conformément au §9.

**Ce que la comparaison avec Scryfall a révélé (4d-3).** Trois défauts d'ingestion
antérieurs, qui faussaient **toute** la recherche de −1 à −2 % :
1. `is_extra` et `is_funny` étaient lus sur la première impression rencontrée. Une
   réimpression de collection masquait la carte entière (Demonic Tutor, Grim
   Monolith, Survival of the Fittest), et les 141 cartes Unfinity légales étaient
   classées « blague ». Désormais calculés sur toutes les impressions.
2. Une impression `reversible_card` arrivée en premier définissait la carte :
   11 cartes renommées « Magmatic Hellkite // Magmatic Hellkite ».
3. Sans statistiques, le planificateur choisissait l'index des filtres par défaut
   (82 % des cartes) : recherche par nom exact 32 ms → **0,05 ms** après `ANALYZE`.

**Relecture (agent `reviewer`), corrigée avant commit :** `cmc>pow` bloquait le
serveur 3 min (sous-requête sans index) ; `-( … )` était ignoré et renvoyait
l'inverse ; `m:0`, `is:constructor` et 250 `-` d'affilée donnaient des 500 ;
les erreurs techniques s'affichaient brutes ; une base de l'ancien schéma
aurait cassé la recherche sans être reconstruite. Tous couverts par des tests.

**Suites à décider :**
- **Impression affichée.** La « meilleure » impression est la plus récente en
  haute résolution : la recherche montre souvent une réimpression Universes
  Beyond (Marvel, etc.). La page d'accueil les exclut déjà ; faut-il les
  écarter aussi de l'affichage par défaut ?
- **La CI ne lance pas `npm run test`** (ni `ci.yml` ni `release.yml`).

Écarts restants, assumés et documentés dans `mtg-syntax.ts` : mots nus en début de
mot plutôt qu'en sous-chaîne (`goblin` −2,5 %), `pow>tou` −2,9 %, termes
d'impression évalués sur les impressions anglaises, prix en EUR seulement, pas de
regex. Tout mot-clé non pris en charge (`usd:`, `ft:`, `otag:`…) est **refusé avec
un message** qui nomme le terme, jamais ignoré en silence.

---

## 6 ter. Lots 3, 6 et 7 : découpage et arbitrages

Découpage proposé par l'agent `architect` (analyse du 16/09, fichier par fichier) :

- **Trois couches.** `shared/` pour le code pur (identifiant de jeu, capacités,
  formats de decklist, règles de chaque jeu), testé sous Node ; `app/providers/`
  pour l'adaptateur client de chaque jeu ; **rien de polymorphe côté serveur**,
  les deux moteurs ayant des contrats différents et déjà testés (Magic résout
  par nom, One Piece par numéro).
- **Clé de jointure.** `GameCard.key` : le nom anglais pour Magic, le numéro de
  carte pour One Piece, dont les noms sont traduits et non uniques.
- **Ordre imposé par les données.** Colonne `game` en base, puis stockage invité
  v2, puis création de decks One Piece : un deck One Piece migré vers le compte
  avant que le serveur connaisse `game` deviendrait Magic, sans retour possible.

Arbitrages rendus (autonomie accordée le 16/09) :

| Question | Décision | Pourquoi |
|---|---|---|
| Routage | `/magic/deck/[id]` et `/one-piece/deck/[id]` ; `/deck/[id]` redirige | Univers et mode fixés par page, code séparé par jeu (un deck One Piece ne charge ni jsPDF ni le coach), base du SEO du lot 8 |
| Mode clair/sombre | Imposé par l'univers (One Piece de jour, Magic de nuit) ; le bouton reste sur les pages neutres | C'est la direction validée ; la préférence enregistrée n'est pas réécrite |
| Images One Piece | **Miroir complet des deux langues** ; la route ne sert que le disque, avec repli sur l'autre langue | Bandai n'accorde ni permission de cache ni exemption : aucun appel au runtime |
| Decklist One Piece | `4xOP01-016`, art en suffixe (`_p1`), Leader écrit en premier | Copier-coller compatible avec les simulateurs ; le Leader se reconnaît à sa catégorie |
| Échec de migration | Le serveur refuse de démarrer | Mieux que des 500 silencieux sur toutes les routes de decks |
| Deck de Magic | La page existante est déplacée et habillée, pas réécrite | Elle fonctionne ; la réécrire en espace de travail générique est un risque sans gain pour l'utilisateur. Les pièces neutres (barre d'outils, historique, sauvegarde) sont partagées |

### Arbitrages de la fin de programme (16/09, autonomie)

| Question | Décision | Pourquoi |
|---|---|---|
| `CardProvider` (fin du lot 3) | **Abandonné** | Aucun écran n'est polymorphe : chaque univers a ses pages et ses composables (`useOptcgDeck`, `useCardSearch`…). Le contrat commun est `shared/game.ts` (capacités, chemins) et `GameCard`. Déplacer `useMtg` et `scryfall/*` dans `providers/` coûterait un gros diff sans gain |
| Pages rendues par le serveur | Accueil `/landing`, bibliothèques, pages carte, Découvrir, decks partagés. `/` reste une SPA | `/` choisit entre accueil et tableau de bord d'après les decks du navigateur, que le serveur ne voit pas. Le document de base porte quand même titre et description |
| Grilles des bibliothèques | Rendues dans le navigateur | Les rendre côté serveur demanderait un état de recherche partagé serveur/client ; l'indexation passe par les pages carte et le sitemap |
| Langue | Cookie `prism_locale`, `?lang=` la change et la garde | Le serveur rend la bonne langue sans éclair ; les alternates hreflang pointent vers `?lang=` |
| Decks partagés | Indexés seulement s'ils sont listés dans Découvrir | Un lien de partage reste un lien, pas une publication |
| Adresse des cartes Magic | Nom anglais, face avant pour une carte double | Stable entre les langues, jamais de barre oblique dans l'adresse |
| Rafraîchissement des cartes | Processus enfants, pas de fils de travail | Les scripts existent et sont testés ; le client libSQL synchrone bloquerait le serveur |
| Base de cartes absente au démarrage | Construite aussitôt en tâche de fond | Une installation neuve fonctionne sans intervention |

**Découvert en route (préexistant) :** l'image Docker ne démarrait pas, le binaire
natif de libSQL n'étant pas suivi par le build (corrigé, vérifié en construisant
l'image). Les libellés de rareté avaient été supprimés comme « clés mortes »
(corrigé). Le passage au rendu hybride a fait disparaître l'appel à Iconify : les
icônes passent désormais par la route locale `/api/_nuxt_icon`.

### Passe qualité du 16/09 (soir)

Demande : passe complète, correction des bugs, tous les parcours, fluidité, landing
« de ouf », puis déploiement.

- **Parcours** : 59 vérifications de bout en bout dans un Chrome sans interface
  (`npm run test:e2e`), sans aucune erreur console ni réponse 5xx ; 178 tests Vitest.
- **Deux audits** (atelier Magic ; tableau de bord, comptes, One Piece) : 33 défauts,
  dont 3 critiques corrigés : import EDHREC cassé (format changé), sauvegarde d'un état
  déjà annulé, éditions épinglées à numéro non numérique qui cassaient la carte.
- **Aucune perte de deck** : file d'écritures persistée pour les comptes, écritures
  fusionnées entre onglets pour les invités, migration qui garde les dates et ne retire que
  ce que le serveur a pris.
- **Landing** sur `/` pour tous, tableau de bord déplacé sur `/decks`.
- **Fluidité** : JS transféré 830 → 240 Ko (Brotli), images du premier écran One Piece
  2,6 → 0,57 Mo (vignettes), LCP < 300 ms et zéro tâche longue sur toutes les pages
  mesurées ; mobile vérifié à 390 px sans débordement.
- **Constat d'outillage** : l'onglet Chrome piloté à distance était masqué ; le navigateur
  y suspend `requestAnimationFrame`, d'où des transitions figées qui ne concernaient pas
  les utilisateurs.

### Tas de cartes et mise en production (16/09, nuit)

- **Tas de cartes interactif** rendu au héros, pour les deux jeux : One Piece à gauche,
  Magic à droite, vitrine par monde avec lien vers la fiche, distribution au repos. Moteur
  du premier héros conservé ; sa boucle ne tournait jamais à l'arrêt (vitrine et pointeur
  la gardaient active) : elle s'arrête désormais dès que tout est posé. Le fond animé
  global, caché sous la landing, n'y est plus monté (60 images/s économisées).
- **Vignettes Magic** à la demande (`?size=thumb`, sharp dans le serveur) : le tas pèse
  ~1,6 Mo d'images mesurés, contre ~9,7 Mo estimés pour l'ancien héros (90 cartes pleine taille).
- **Production** (`root@192.168.1.2`, conteneur Unraid `spellforge`, port 3030, derrière
  swag) : image construite sur le serveur, bases de cartes et miroirs d'images copiés
  dans le volume (9,1 Go), migration `0002_deck_game` appliquée (3 comptes et 7 decks
  intacts), `NUXT_PUBLIC_SITE_URL` ajoutée au modèle Unraid. Vérifié : 61/61 de bout en
  bout sur un conteneur d'essai, 45/45 (parcours invités) sur https://spellforge.diixhub.fr.
- **Retour arrière** : `:0.3.2` dans « Repository » puis Apply ; la base d'avant migration
  reste dans le volume (`spellforge.db.bak-20260916-214058`).
- **Déployer ensuite** : fusion dans `main` → la release publie l'image sur ghcr → dans
  Unraid, « Check for Updates » puis « apply update » (script `update_container` : tire
  l'image et recrée le conteneur depuis le template, qui porte désormais
  `NUXT_PUBLIC_SITE_URL`). « Apply » dans la fiche du conteneur ne tire l'image que si
  elle est absente (Unraid 7.3.2, `CreateDocker.php`) : il recrée avec l'image présente.
- **v0.4.0** (PR #6 fusionnée) : l'image publiée par la CI tourne en production, déployée
  par `update_container spellforge`, le script derrière « apply update » (conteneur recréé
  depuis le template, digest identique à ghcr, vignettes Magic fabriquées dans le
  conteneur). 45/45 parcours invités en HTTPS après la mise à jour.
- **Rangement (17/09)** : scripts manuels et fichier de secrets retirés de `/root`, images
  locales remplacées supprimées, ancien cache et sauvegarde redondante effacés, cache de
  build des images manuelles vidé (1,48 → 0,27 Go). Le rafraîchissement nocturne du 17 a
  tourné en production (One Piece, images, Magic : OK). Les messages d'erreur affichés
  passent par `message` : h3 retire déjà les accents de la ligne de statut HTTP et prévoit
  de nettoyer `statusMessage` aussi dans le corps de la réponse.

### Retours de Viktor (21/09)

Quatre remarques après usage, trois arbitrages pris avec lui avant d'écrire.

- **Import confus** : deux boutons portaient le même mot pour deux choses différentes
  (l'en-tête créait un deck depuis une URL, la page de deck remplaçait la liste collée),
  et Magic n'acceptait qu'une URL, One Piece qu'une liste. Désormais **une seule fenêtre**
  (`DeckIoModal`, montée dans la coquille, ouverte par `useImportOverlay`) : lien EDHREC ou
  Archidekt **ou** liste collée, pour les deux jeux, avec le choix de destination — nouveau
  deck, ou remplacer le deck ouvert. La page de deck s'y déclare comme cible
  (`registerTarget`) et y garde copier, télécharger et charger un fichier. L'en-tête n'emmène
  plus au tableau de bord : la fenêtre s'ouvre sur place.
  Le bouton « Importer un fichier » devient « Charger un fichier » : deux boutons contenant
  « Importer » dans la même fenêtre, c'était la confusion d'origine en plus petit.
- **Moxfield** : leur API répond 403 à tout accès automatisé et l'accès est réservé à un
  partenariat. Le message existant (« Seuls les liens EDHREC et Archidekt sont pris en
  charge ») suffit ; la liste se colle depuis leur export.
- **Coach IA** : la route exigeait déjà un compte, mais la pastille et le panneau
  s'affichaient pour un visiteur, qui ne découvrait le mur qu'à l'envoi. Le Coach n'est plus
  monté du tout sans compte.
- **Ambiance Magic** : le registre « grimoire / arcane » ne correspond pas au Magic
  d'aujourd'hui (les univers croisés). Direction retenue : **la table de jeu**. Feutrine
  sombre et laiton à la place de l'obsidienne et de l'or, angles adoucis, animations plus
  vives, `FxMagicTable` (tapis surpiqué, zones de jeu, poussière dans la lampe) à la place du
  cercle d'invocation, tuile de deck en deck manchonné avec son jeton plutôt qu'en grimoire
  scellé à la cire. Les deux polices à empattements (Cinzel, EB Garamond) disparaissent au
  profit de la police neutre : deux familles de moins à télécharger. Vocabulaire revu dans
  les deux langues (« Le grimoire » → « La bibliothèque », « Invoqué » → « Posé »…).
- **Mesures de vitesse** : quatre tests chronométrés échouaient au hasard selon la charge de
  la machine. Ils gardent leurs bornes serrées mais s'effacent au-dessus d'une charge
  moyenne (`itPerf`, `test/support/perf.ts`) ; `PERF=1` les force.

### Magic en plein jour (21/09, soir)

Viktor : « Pas très fan des couleurs. Pourquoi tu restes sur du sombre pour Magic ? »
Bonne question — rien ne l'imposait : `universes.css` forçait un mode par univers (One
Piece clair, Magic sombre), reste de l'identité « de nuit ». Le bouton clair/sombre
n'avait donc aucun effet sur les pages Magic.

Direction retenue avec lui : **atelier en plein jour**, accent **bleu encre**, panneau
d'accueil **clair des deux côtés**.

- Tokens Magic réécrits en clair (papier `#f7f7f5`, surfaces blanches, encre graphite,
  accent `45, 79, 124`), ombres douces, grain de papier au lieu de la feutrine.
- Le tapis de fond garde ses zones mais passe en plein jour, et sa poussière se dépose
  (`source-over`) au lieu d'éclaircir : en `lighter`, elle disparaissait sur fond clair.
- Landing : le panneau devient parchemin à gauche, papier à droite, avec de l'encre
  sombre ; les sections Magic (chiffres, recherche, mondes, parcours, portes, pied de
  page) passent au papier. **Ce qui flotte au-dessus du tas de cartes garde son encre
  claire** : barre du haut, légendes des cartes en vitrine, pastille de défilement.
- Tuile de deck Magic, fiche carte, carte de bibliothèque : surfaces claires et bordures
  neutres, jeton bleu à la place du jeton laiton.
- Contrôle : une sonde de contraste parcourt la page et relève tout texte sous 3:1. Elle a
  trouvé les vrais oublis (plaques sombres restées sous du texte devenu sombre) et deux
  faux positifs (texte sombre sur un bleu à 7 % posé sur blanc).

---

## 7. Ce qui reste externe (assumé)

| Dépendance | Pourquoi elle reste |
|---|---|
| **EDHREC** | Recommandations « souvent joué avec ». Ce n'est pas de la donnée carte et il n'existe aucun équivalent local. Alternative à terme : calculer nos propres statistiques sur les decks publics de la plateforme |
| **Archidekt** | Import d'un deck public par URL (`server/api/import.post.ts`), à la demande de l'utilisateur. Comme EDHREC, ce n'est pas de la donnée carte : les noms importés sont ensuite résolus dans la base locale |
| **API Anthropic** | Le coach. Son outil `scryfall_search` passe désormais par l'analyseur local ; une syntaxe non prise en charge renvoie au modèle un message qui nomme le terme à corriger |
| **CDN Scryfall** (`cards.scryfall.io`) | Sollicité **une seule fois par image**, pour les tailles non mirorées (`large`, `png`) : la route locale récupère puis sert depuis le disque (217 ms la 1re fois, 1,5 ms ensuite). Explicitement exempté de limite de débit par Scryfall |
| ~~**Iconify**~~ | **Réglé par le lot 8** : avec le rendu hybride, `@nuxt/icon` sert les icônes par `/api/_nuxt_icon` depuis les collections locales (vérifié dans les requêtes réseau du navigateur) |
| **punk-records** (GitHub) et **site Bandai** | Sources de la base et des images One Piece, lues **uniquement par la tâche nocturne**, jamais par une requête d'utilisateur |

---

## 8. Cadre légal

**Magic** — Scryfall **encourage explicitement** le cache local : « We encourage you
to cache the data you download from Scryfall », et « If you need to rapidly look up
card names, prices, or resolve a large number of card images, **you must use the
bulk data files** ». Interdits : mettre les données derrière un paywall, republier
brut sans valeur ajoutée, recadrer le copyright ou le nom de l'artiste. Un
deckbuilder passe largement la barre. Mention Fan Content à afficher.

**One Piece** — **aucune licence, aucun équivalent fan-content.** Les données sont
scrapées du site Bandai et restent « copyrighted by ©Eiichiro Oda/Shueisha, Toei
Animation, Bandai Namco ». Le miroir de 2 888 visuels est une décision d'exposition
assumée. L'absence de proxy est notre meilleure protection : c'est précisément la
fonctionnalité que visent les règles IP de Bandai (« goods derived from or copied
from card designs »). Disclaimer visible obligatoire.

---

## 8 bis. Pourquoi jspdf était urgent

L'audit de départ comptait 50 vulnérabilités, presque toutes dans l'outillage de
build — j'avais vérifié qu'aucune n'atteignait `.output`. **Sauf jspdf.** C'est une
dépendance directe qui s'exécute dans le navigateur de l'utilisateur, nourrie de
texte de decklist et d'images distantes. La 2.5.2 cumulait **deux critiques** —
inclusion de fichier local / traversée de chemin (`GHSA-f8cm-6447-x5h2`) et
injection HTML (`GHSA-wfv2-pwc8-crg5`) — et une demi-douzaine de hautes :
injection d'objets PDF permettant l'exécution de JavaScript arbitraire, ReDoS,
DoS via dimensions GIF/BMP malformées.

La surface d'API réellement utilisée par `usePdfExport.ts` est minuscule et
stable (`addPage`, `addImage`, `setDrawColor`, `rect`, `setLineWidth`, `line`,
`save`, `output`), et l'import était déjà dynamique : la montée en v4 n'a demandé
aucune modification de code. Les 33 alertes `@tiptap/*` étaient transitives via
`@nuxt/ui` et tombent avec la 4.11.1, qui corrige au passage un arbre de
dépendances incohérent (`deduped invalid`).

## 9. À valider avant de démarrer

1. **Images Magic** — trois options :
   - **miroir `normal` + `small` EN+FR (~16 Gio)** → indépendance totale *(ma recommandation, cohérente avec l'objectif annoncé)*
   - cache à la demande (quelques Gio, croît avec l'usage)
   - hotlink `cards.scryfall.io` — explicitement **sans limite de débit** et sanctionné par la doc, mais c'est une dépendance externe qui subsiste
2. **Le nom Prism** — vérifier domaine et antériorité avant d'engager le rebrand.
3. **Accès SSH** — les deux clés disponibles (`alsatis`, `jolibrain`) sont rejetées
   par 192.168.1.2. Débloquer avec `ssh-copy-id -i ~/.ssh/alsatis.pub root@192.168.1.2`.
4. **Le sélecteur d'édition multilingue** actuel (`include_multilingual=true`) affiche
   toutes les langues. Un ingest EN+FR le dégraderait visiblement. On assume, ou on
   ingère toutes les langues (542 326 lignes, base ~700 Mio au lieu de 239 Mio).

---

## 10. Risques

| Risque | Mitigation |
|---|---|
| One Piece : source scrapée, sans SLA | punk-records est régénéré chaque semaine ; sa cadence est notre signal d'alerte. vegapull en repli |
| Une refonte du site Bandai casse tout | Snapshot versionné à chaque release ; l'app continue de tourner sur la dernière base valide |
| Couverture FR structurellement partielle | OP FR : 37 packs sur 60. Magic FR : `printed_type_line` à 78 %. Le repli EN par carte se conçoit dès le départ, pas après |
| Prix périmés | Scryfall : « dangerously stale after 24 hours ». Ré-ingestion quotidienne si on affiche des prix, hebdomadaire sinon |
| Régression silencieuse à la bascule | Le lot 3 impose zéro changement de comportement, et le lot 2 est couvert par des tests comparés aux comptes Scryfall |
| **Une requête lente bloque tout le serveur** | Le client libSQL local est **synchrone** : pendant qu'une requête tourne, Nitro ne sert personne. La relecture du lot 4 l'a prouvé (`cmc>pow` : 181 s, zéro tick de la boucle d'évènements). Chaque forme de requête de l'analyseur est désormais bornée (pire cas mesuré ~200 ms à 40 termes). **Reste à faire :** limite de débit sur `/api/cards/browse` au niveau du proxy inverse (l'utilitaire `rateLimit` ne purge pas ses entrées et ne convient pas à une clé par IP) ; à terme, requêtes de cartes hors du fil principal |

---

## 11. Choisir une illustration (24/09)

> Demande de Viktor : « pas assez mise en avant, pas de prévisu, 3 clics pour changer ».
> Validé : points 1 à 4 ci-dessous. Même mode d'autonomie que les lots précédents.

**Constat.** 4 actions pour changer d'illustration (ouvrir la fiche, descendre, déplier
« Versions », cliquer), fermeture de la fiche sans voir le résultat, aucun signe qu'une
carte est épinglée, pas de retour à l'automatique.

| Lot | Contenu | Fichiers |
|---|---|---|
| A. Données | `/api/cards/prints` renvoie la qualité (`highres`) et l'image `large`. Nouveau `POST /api/cards/prints` en lot (`{ names, lang }` → impressions par nom) pour les actions de deck et le défilement. Composable `usePrintings` : cache partagé par (nom, langue) | `server/api/cards/prints*.ts`, `mtg-query.ts`, `app/composables/usePrintings.ts` |
| B. Fiche carte | Bande de vignettes toujours visible sous la grande image. Survol ou focus → la grande image, l'édition et le prix montrent cette version. Clic → épingle, la fiche reste ouverte, toast « Annuler ». Vignette « Auto » en tête (retire le pin). Badges FR/EN et « basse déf. ». Compteur d'illustrations | `CardDetailModal.vue`, `card/PrintingPicker.vue`, page deck |
| C. Aperçu visuel | Flèches ‹ › au survol d'une carte : défilement des impressions sur place, enregistré tout de suite ; ← → au clavier sur la carte survolée ; image affichée sans attendre la résolution | `MtgCardPreview.vue`, `DeckPreviewOverlay.vue`, page deck |
| D. Visibilité | Icône d'épingle dans la liste du deck et sur les cartes de l'aperçu | `DeckGroupedList.vue`, `MtgCardPreview.vue` |
| E. Actions de deck | Panneau « Illustrations » dans l'aperçu : tout en automatique, tout en rétro (plus ancienne), tout en récent, une même édition pour tout le deck (liste des éditions triées par nombre de cartes couvertes). Une seule écriture → un seul pas d'annulation | `DeckPreviewOverlay.vue` (+ composant dédié), `useDeckBuilder.setPrintings` |

**Arbitrages.**
- Pas de « full-art » ni de « tout en HD » : la base n'a pas de drapeau full-art (le
  schéma changerait et la prod devrait réingérer) et, en FR, la haute déf. anglaise est
  écartée par la règle « la langue d'abord » (PR #12) — l'action ne ferait rien.
- Le sélecteur ne propose que des impressions affichables (PR #12), donc un choix se voit
  toujours.
- Le défilement part du pin de l'entrée quand il existe (pas de la carte résolue, en
  retard de 350 ms), pour que des clics rapides avancent bien d'un cran chacun.

### Choix explicite de l'anglais (24/09, soir)

Retour de Viktor : Manigances boggartes n'existe en français qu'en scan basse définition
(Lorwyn), alors que Lorwyn anglais est net, et rien ne permettait de le choisir. Cause : la
règle « la langue d'abord » (PR #12) ignorait tout pin anglais sur un deck français.

- **Marqueur `[EN]`** après le suffixe Arena : `1 Boggart Shenanigans (LRW) 155 [EN]`. Un pin
  marqué est toujours honoré ; un pin sans marqueur garde la règle du français d'abord (Blood
  Moon reste « Lune de sang »). Le marqueur est retiré des exports texte (copie,
  téléchargement), que les autres sites ne liraient pas.
- **Bande d'illustrations** : les impressions françaises, puis un groupe « En anglais ».
  Choisir une impression anglaise sur un deck français écrit le marqueur.
- **« Tout en anglais HD »** dans le panneau du deck : la meilleure impression anglaise de
  chaque carte, haute définition d'abord, puis la plus récente.
- Les clés d'impression portent la langue (`lrw/155@fr` ≠ `lrw/155@en`) : Lorwyn #155 existe
  dans les deux langues.
- Tout le deck en anglais sans pins reste possible avec le bouton FR/EN du site.

---

## 12. Galerie, thèmes et netteté (24/09, nuit)

> Demande de Viktor : (1) des cartes FR nettes, (2) une navigation praticable quand une carte a
> des centaines d'illustrations, (3) des thèmes de deck. Validé : galerie, puis thèmes niveau 1,
> puis essai d'agrandissement IA sur un échantillon.

Chiffres (base locale du 24/09) : 25 006 cartes s'affichent en FR, **21 042 en scan basse
définition** (84 %). Montagne : 331 impressions FR et 862 EN ; Sol Ring : 45 FR et 137 EN.

| Lot | Contenu |
|---|---|
| G. Galerie | La bande de la fiche montre 12 illustrations et un bouton « Voir les N ». Il déplie une grille dans la fiche (défilement vertical) : recherche (édition, code, artiste), filtres langue / HD / sans promos / style, tri récentes / anciennes / prix, intertitres par édition. Survol et clic inchangés. |
| T. Thèmes niveau 1 | L'ingestion garde les styles d'impression de Scryfall dans une colonne `style` (masque de bits : full-art, sans bordure, showcase, extended art, ancien cadre 1993/1997, gravé) et l'artiste part avec chaque impression. Panneau du deck : « Appliquer un thème » (un style ou un artiste), dans la langue du deck d'abord, sinon en anglais `[EN]`. `SCHEMA_VERSION` 2 → 3. |
| U. Netteté | Essai d'agrandissement IA (Real-ESRGAN) sur un échantillon de scans FR basse définition ; avant/après à montrer avant toute généralisation. |

**Mise en production du lot T.** Le rafraîchissement nocturne reconstruit la base quand le
schéma change, mais seulement à 04 h 30. Le plugin de démarrage relance donc la reconstruction
dès que la version de la base est en retard, et les requêtes d'impressions tolèrent l'ancienne
base (style à 0) pendant les ~3 minutes de reconstruction.

**Hors périmètre.** « Thème Deadpool » par le contenu de l'image (niveaux 2 et 3 : étiquettes
Tagger, empreintes CLIP) ; les noms de drops Secret Lair ne sont pas dans les données de masse.

### Résultat du lot U (essai d'agrandissement IA, 24/09)

Real-ESRGAN (poids officiels xinntao) sur 8 scans FR basse définition du deck Krenko, GPU M4 :

| Époque du scan | Résultat | Cartes floues concernées |
|---|---|---|
| **2020 et après** (Krenko FDN, Lune de sang WOT, Cité des Trois arbres BLB) | Texte et illustration nettement plus nets, sans déformation | **13 318** |
| 2015-2019 | Non testé en détail | 3 602 |
| **Avant 2015** (Lorwyn, 10e édition) | **Texte rendu illisible** : le modèle invente des lettres. Pire que le flou | 4 122 |

- `realesr-general-x4v3` : 0,5 s par carte, qualité proche de `RealESRGAN_x4plus` (8,7 s).
  Passe complète 2020+ : environ **2 h** sur le Mac, ~400 Ko par image en 2x.
- Décision à prendre avec Viktor (non lancé) : générer une variante « nette » pour les scans FR
  2020+ seulement, servie par la route d'images à la place du scan flou ; jamais pour les
  scans anciens. Comparatif : `~/Desktop/prism-comparatif-nettete.jpg`.

---

## 13. Cartes françaises recomposées (24/09, nuit)

> Validé par Viktor sur le prototype v3 (6 cartes, 5 cadres) : illustration et cadre du scan
> anglais HD, texte français recomposé avec les polices d'origine (Beleren, Matrix, Plantin),
> installées sur le Mac de Viktor et jamais versionnées.

**Cibles** (bulk Scryfall du 24/09) : 40 132 impressions FR en basse définition ont leur jumelle
anglaise en HD ; ~20 000 sont celles affichées par défaut (`best_printings`), traitées d'abord.

| Famille | Impressions | Lot |
|---|---|---|
| Cadre 2015, bordure noire, sans effet | 28 653 | R1 |
| Cadre 2003 | 7 106 | R1 |
| Cadre 1997 | 784 | plus tard (police Goudy Medieval absente) |
| Sans bordure, showcase, doubles faces, sagas, aventures, fractionnées… | ~3 600 | plus tard |

| Lot | Contenu |
|---|---|
| R1. Générateur (Mac) | `scripts/recompose/` (Python) : lit le bulk, télécharge le PNG anglais, efface nom / type / texte, compose le français (titre calibré au pixel, texte Plantin plafonné à 37 px, symboles Mana, « FR » dans la ligne du bas, `—` → `:` dans le type, apostrophe typographique). **Contrôle automatique par carte** : le texte anglais est d'abord recomposé sur la même carte et comparé au scan d'origine ; au-delà d'un seuil, la carte est écartée et garde son scan officiel. Sortie : un JPEG 745×1040 par impression. |
| R2. Serveur | La route d'images sert la version recomposée d'une impression FR quand elle existe (`r=1` dans l'URL, donc un cache séparé) ; la forme des cartes signale `recomposed`. Tailles `large` / `normal` / `small` dérivées à la demande (sharp), comme les vignettes. |
| R3. Interface | Badge « Recomposée » dans la fiche, et réglage « Scans officiels » (par navigateur) qui retire `r=1` des URLs. |
| R4. Livraison | Copie des JPEG dans `/mnt/user/appdata/spellforge/images/mtg/recomposed/` (mode à confirmer avec Viktor). |

**Garde-fous.** Les polices ne quittent pas le Mac ; seules les images produites sont servies.
Un scan officiel reste toujours accessible. Rien n'est écrasé : les recompositions vivent dans
leur propre dossier.
